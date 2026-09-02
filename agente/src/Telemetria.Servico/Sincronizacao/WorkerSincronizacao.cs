using System.Reflection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Telemetria.Nucleo.Configuracao;
using Telemetria.Nucleo.Dados;
using Telemetria.Nucleo.Modelos;

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
    private readonly ILogger<WorkerSincronizacao> _log;

    private readonly string _versao = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "1.0.0";
    private int _intervaloMinutos;

    public WorkerSincronizacao(
        BufferTelemetria buffer,
        ClienteSupabase cliente,
        GerenciadorMatricula matricula,
        OpcoesAgente opcoes,
        ILogger<WorkerSincronizacao> log)
    {
        _buffer = buffer;
        _cliente = cliente;
        _matricula = matricula;
        _opcoes = opcoes;
        _log = log;
        _intervaloMinutos = Math.Max(1, opcoes.MinutosEntreSincronizacoes);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _log.LogInformation("Worker de sincronização iniciado (intervalo {m} min).", _intervaloMinutos);

        // Pequeno atraso inicial: deixa o boot da máquina/rede assentar antes do primeiro envio.
        await EsperarSeguro(TimeSpan.FromSeconds(45), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                _buffer.PurgarAntigos(_opcoes.DiasRetencaoLocal);
                await SincronizarTudoPendenteAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Ciclo de sincronização falhou. Tentando no próximo intervalo.");
            }

            await EsperarSeguro(TimeSpan.FromMinutes(_intervaloMinutos), stoppingToken);
        }

        _log.LogInformation("Worker de sincronização encerrado.");
    }

    private async Task SincronizarTudoPendenteAsync(CancellationToken token)
    {
        var pendentes = _buffer.ContarPendentes();
        if (pendentes == 0)
        {
            _log.LogDebug("Nada pendente para sincronizar.");
            return;
        }

        var tokenDispositivo = await _matricula.ObterTokenAsync(token);
        if (string.IsNullOrEmpty(tokenDispositivo))
        {
            _log.LogWarning("Sem token de dispositivo; adiando envio. {n} registros aguardando.", pendentes);
            return;
        }

        _log.LogInformation("Iniciando sincronização de {n} registros pendentes.", pendentes);
        var totalEnviado = 0;

        // Esvazia em lotes até acabar o pendente ou a rede falhar (aí paramos e tentamos depois).
        while (!token.IsCancellationRequested)
        {
            var lote = _buffer.LerLote(_opcoes.TamanhoLote);
            if (lote.Count == 0)
                break;

            var pacote = new LoteTelemetria
            {
                VersaoAgente = _versao,
                EnviadoEm = DateTimeOffset.UtcNow,
                Registros = [.. lote]
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
                    return;
                }
                continue; // Refaz o mesmo lote com o token novo.
            }

            if (resposta is null)
            {
                // Falha recuperável: preserva o lote e para. Próximo intervalo tenta de novo.
                _log.LogWarning("Envio interrompido; {n} registros seguem no buffer.", _buffer.ContarPendentes());
                break;
            }

            // Servidor confirmou: apaga localmente tanto os aceitos quanto os duplicados
            // (duplicado = servidor já tem; não faz sentido reenviar).
            var removidos = _buffer.ApagarPorId(lote.Select(r => r.IdLocal));
            totalEnviado += resposta.Aceitos;

            _log.LogInformation("Lote enviado: {a} aceitos, {d} duplicados, {r} limpos do buffer.",
                resposta.Aceitos, resposta.Duplicados, removidos);

            AjustarIntervalo(resposta.ProximaSincronizacaoEmMinutos);

            if (lote.Count < _opcoes.TamanhoLote)
                break; // Último lote parcial: acabou o pendente.
        }

        if (totalEnviado > 0)
            _buffer.CompactarSePreciso();
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
