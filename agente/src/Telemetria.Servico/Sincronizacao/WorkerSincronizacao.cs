using System.Reflection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Telemetria.Nucleo.Configuracao;
using Telemetria.Nucleo.Dados;
using Telemetria.Nucleo.Modelos;
using Telemetria.Nucleo.Seguranca;
using Telemetria.Servico.Atualizacao;

namespace Telemetria.Servico.Sincronizacao;

/// <summary>
/// Worker de sincronização em lote (offline-first). A cada intervalo configurado, drena
/// o buffer em blocos de até TamanhoLote, envia num único POST e só apaga localmente
/// após o HTTP 200. Rede fora do ar? Os registros ficam no SQLite até a próxima janela.
/// </summary>
public sealed class WorkerSincronizacao : BackgroundService
{
    private readonly BufferTelemetria _buffer;
    private readonly ClienteSupabase _cliente;
    private readonly GerenciadorMatricula _matricula;
    private readonly OpcoesAgente _opcoes;
    private readonly AtualizadorAgente _atualizador;
    private readonly ILogger<WorkerSincronizacao> _log;

    private readonly string _versao = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "1.0.0";
    private int _intervaloMinutos;

    /// <summary>
    /// Ate o primeiro lote sair, o laco olha de novo em segundos em vez de esperar
    /// o intervalo inteiro — e esse lote que faz a PESSOA aparecer no painel.
    /// Limitado aos primeiros minutos de vida, para uma maquina sem ninguem logado
    /// (e portanto sem atividade) nao ficar acordando a cada 20 segundos para sempre.
    /// </summary>
    private bool _primeiroLoteEnviado;
    private readonly DateTimeOffset _inicio = DateTimeOffset.UtcNow;

    /// <summary>
    /// Ciclos que falharam seguidos. Zera no primeiro sucesso e comanda a
    /// espera curta entre tentativas — ver o recuo progressivo em ExecuteAsync.
    /// </summary>
    private int _falhasSeguidas;

    public WorkerSincronizacao(
        BufferTelemetria buffer,
        ClienteSupabase cliente,
        GerenciadorMatricula matricula,
        OpcoesAgente opcoes,
        AtualizadorAgente atualizador,
        ILogger<WorkerSincronizacao> log)
    {
        _buffer = buffer;
        _cliente = cliente;
        _matricula = matricula;
        _opcoes = opcoes;
        _atualizador = atualizador;
        _log = log;
        _intervaloMinutos = Math.Max(1, opcoes.MinutosEntreSincronizacoes);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _log.LogInformation("Worker de sincronização iniciado (intervalo {m} min).", _intervaloMinutos);

        // Atraso curto, so para o servico terminar de subir. Antes eram 45 s fixos
        // que, somados a regra de so matricular quando havia registro pendente,
        // faziam a estacao levar uns 7 minutos para aparecer no painel depois de
        // instalada — o instalador dizia "em ate uma hora". Se a rede ainda nao
        // estiver pronta (maquina recem-ligada), o recuo progressivo cuida disso.
        await EsperarSeguro(TimeSpan.FromSeconds(5), stoppingToken);

        // Matricula JA, sem esperar ter atividade para enviar: a estacao precisa
        // aparecer no painel no instante em que e instalada, para quem instalou
        // conferir na hora que deu certo. O instalador espera por esta matricula.
        try
        {
            await _matricula.ObterTokenAsync(stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            return;
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Matricula inicial falhou; nova tentativa no proximo ciclo.");
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            var sucesso = false;
            try
            {
                _buffer.PurgarAntigos(_opcoes.DiasRetencaoLocal);
                sucesso = await SincronizarTudoPendenteAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Ciclo de sincronização falhou.");
            }

            await EsperarSeguro(ProximaEspera(sucesso), stoppingToken);
        }

        _log.LogInformation("Worker de sincronização encerrado.");
    }

    /// <summary>
    /// Quanto esperar até a próxima tentativa.
    ///
    /// Antes o worker esperava o intervalo inteiro depois de qualquer falha, e
    /// isso doeu de verdade: numa máquina recém-ligada (04/09/2026) a primeira
    /// tentativa pegou a rede ainda subindo, falhou, e o agente ficou UMA HORA
    /// em silêncio por causa de alguns segundos de Wi-Fi.
    ///
    /// Agora a falha encurta a espera e vai cedendo — 1, 2, 4, 8... minutos —
    /// até o teto do intervalo configurado. Nunca fica mais lento que o normal
    /// nem mais agressivo que o combinado com a empresa.
    /// </summary>
    private TimeSpan ProximaEspera(bool sucesso)
    {
        if (sucesso)
        {
            _falhasSeguidas = 0;

            // O coletor so grava o primeiro registro depois de fechar um minuto
            // inteiro. Esperar o intervalo aqui era o que atrasava a primeira
            // aparicao da pessoa no painel.
            if (!_primeiroLoteEnviado && DateTimeOffset.UtcNow - _inicio < TimeSpan.FromMinutes(10))
                return TimeSpan.FromSeconds(20);

            return TimeSpan.FromMinutes(_intervaloMinutos);
        }

        // Limitado a 6 para o deslocamento não estourar e a conta ficar óbvia.
        _falhasSeguidas = Math.Min(_falhasSeguidas + 1, 6);
        var minutos = Math.Min(_intervaloMinutos, 1 << (_falhasSeguidas - 1));

        _log.LogInformation(
            "Ciclo sem sucesso ({f}ª seguida). Nova tentativa em {m} min.", _falhasSeguidas, minutos);

        return TimeSpan.FromMinutes(minutos);
    }

    /// <returns>
    /// true quando o ciclo terminou sem pendência retida por falha — inclusive
    /// quando não havia nada a enviar. false quando algo impediu o envio, e aí
    /// o laço tenta de novo mais cedo em vez de esperar o intervalo inteiro.
    /// </returns>
    private async Task<bool> SincronizarTudoPendenteAsync(CancellationToken token)
    {
        var pendentes = _buffer.ContarPendentes();
        if (pendentes == 0)
        {
            _log.LogDebug("Nada pendente para sincronizar.");
            return true;
        }

        var tokenDispositivo = await _matricula.ObterTokenAsync(token);
        if (string.IsNullOrEmpty(tokenDispositivo))
        {
            _log.LogWarning("Sem token de dispositivo; adiando envio. {n} registros aguardando.", pendentes);
            return false;
        }

        _log.LogInformation("Iniciando sincronização de {n} registros pendentes.", pendentes);
        var totalEnviado = 0;
        var eventosEnviados = false;

        // Esvazia em lotes até acabar o pendente ou a rede falhar (aí paramos e tentamos depois).
        while (!token.IsCancellationRequested)
        {
            var lote = _buffer.LerLote(_opcoes.TamanhoLote);
            if (lote.Count == 0)
                break;

            // O diário de bordo pega carona no primeiro lote do ciclo. Só nele:
            // reenviar os mesmos eventos em cada lote seria desperdício, e o
            // servidor os ignoraria por duplicidade de qualquer forma.
            var eventos = eventosEnviados ? [] : _buffer.LerEventos();

            var pacote = new LoteTelemetria
            {
                VersaoAgente = _versao,
                EnviadoEm = DateTimeOffset.UtcNow,
                NomeComputador = IdentidadeMaquina.NomeMaquina,
                Registros = [.. lote],
                Eventos = eventos
            };

            RespostaIngestao? resposta;
            try
            {
                resposta = await _cliente.EnviarLoteAsync(pacote, tokenDispositivo, token);
            }
            catch (TokenInvalidoException)
            {
                _matricula.InvalidarToken();
                tokenDispositivo = await _matricula.MatricularAsync(token);
                if (string.IsNullOrEmpty(tokenDispositivo))
                {
                    _log.LogError("Rematrícula falhou; abortando este ciclo.");
                    return false;
                }
                continue; // Refaz o mesmo lote com o token novo.
            }

            if (resposta is null)
            {
                // Falha recuperável: preserva o lote e para. Próximo intervalo tenta de novo.
                _log.LogWarning("Envio interrompido; {n} registros seguem no buffer.", _buffer.ContarPendentes());
                return false;
            }

            // Servidor confirmou: apaga localmente tanto os aceitos quanto os duplicados
            // (duplicado = servidor já tem; não faz sentido reenviar).
            var removidos = _buffer.ApagarPorId(lote.Select(r => r.IdLocal));
            totalEnviado += resposta.Aceitos;
            _primeiroLoteEnviado = true;

            if (eventos.Count > 0)
            {
                _buffer.ApagarEventos(eventos.Select(e => e.IdLocal));
                eventosEnviados = true;
                _log.LogInformation("{n} eventos de estação enviados.", eventos.Count);
            }

            _log.LogInformation("Lote enviado: {a} aceitos, {d} duplicados, {r} limpos do buffer.",
                resposta.Aceitos, resposta.Duplicados, removidos);

            AjustarIntervalo(resposta.ProximaSincronizacaoEmMinutos);
            AplicarConfiguracaoRemota(resposta.Configuracao);

            // Só depois de um lote aceito: se o envio está funcionando, a rede
            // está boa o suficiente para baixar a versão nova.
            await _atualizador.VerificarAsync(resposta.Configuracao?.Atualizacao, token);

            if (lote.Count < _opcoes.TamanhoLote)
                break; // Último lote parcial: acabou o pendente.
        }

        if (totalEnviado > 0)
            _buffer.CompactarSePreciso();

        return true;
    }

    /// <summary>
    /// Grava a configuração vinda do painel em ProgramData. O coletor, que é
    /// outro processo, lê esse mesmo arquivo e passa a obedecer sem reinstalação
    /// e sem ninguém tocar na máquina.
    /// </summary>
    private void AplicarConfiguracaoRemota(ConfiguracaoRemota? configuracao)
    {
        try
        {
            if (AplicadorConfiguracao.Aplicar(configuracao, _opcoes))
            {
                _intervaloMinutos = Math.Max(1, _opcoes.MinutosEntreSincronizacoes);
                _log.LogInformation(
                    "Configuração atualizada pelo servidor. Sync {m} min, ócio {o}s, janela {i}-{f}.",
                    _opcoes.MinutosEntreSincronizacoes,
                    _opcoes.SegundosParaOcioso,
                    string.IsNullOrEmpty(_opcoes.JanelaColetaInicio) ? "24h" : _opcoes.JanelaColetaInicio,
                    string.IsNullOrEmpty(_opcoes.JanelaColetaFim) ? "24h" : _opcoes.JanelaColetaFim);
            }
        }
        catch (Exception ex)
        {
            // Falha ao gravar não pode derrubar a sincronização: o lote já foi
            // aceito e a configuração antiga continua válida.
            _log.LogWarning(ex, "Não foi possível aplicar a configuração remota.");
        }
    }

    private void AjustarIntervalo(int? sugestaoServidor)
    {
        if (sugestaoServidor is > 0 and <= 720 && sugestaoServidor.Value != _intervaloMinutos)
        {
            _log.LogInformation("Intervalo de sincronização ajustado por remote config: {m} min.", sugestaoServidor.Value);
            _intervaloMinutos = sugestaoServidor.Value;
        }
    }

    private static async Task EsperarSeguro(TimeSpan intervalo, CancellationToken token)
    {
        try { await Task.Delay(intervalo, token); }
        catch (OperationCanceledException) { /* encerrando */ }
    }
}
