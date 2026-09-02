using Microsoft.Extensions.Logging;
using Telemetria.Nucleo.Configuracao;
using Telemetria.Nucleo.Dados;
using Telemetria.Nucleo.Modelos;
using Telemetria.Nucleo.Seguranca;
using Telemetria.Nucleo.Utilitarios;

namespace Telemetria.Coletor.Monitoramento;

/// <summary>
/// Coração da coleta. A cada minuto de relógio consolida um <see cref="RegistroAtividade"/>
/// e grava no buffer. Dentro do minuto, faz subamostras a cada poucos segundos para
/// descobrir o processo dominante, quanto tempo ele ficou em foco e quantos segundos
/// houve atividade real.
/// </summary>
public sealed class AmostradorAtividade
{
    private const int SegundosPorAmostra = 5;

    private readonly OpcoesAgente _opcoes;
    private readonly BufferTelemetria _buffer;
    private readonly InspetorJanela _inspetor;
    private readonly ExtratorDominio _extrator;
    private readonly ContadoresEntrada _contadores;
    private readonly ILogger<AmostradorAtividade> _log;
    private readonly string _usuarioSo;

    public AmostradorAtividade(
        OpcoesAgente opcoes,
        BufferTelemetria buffer,
        InspetorJanela inspetor,
        ExtratorDominio extrator,
        ContadoresEntrada contadores,
        ILogger<AmostradorAtividade> log)
    {
        _opcoes = opcoes;
        _buffer = buffer;
        _inspetor = inspetor;
        _extrator = extrator;
        _contadores = contadores;
        _log = log;
        _usuarioSo = IdentidadeMaquina.UsuarioAtual;
    }

    public async Task ExecutarAsync(CancellationToken token)
    {
        _log.LogInformation("Amostrador iniciado para o usuário {u}.", _usuarioSo);

        // Alinha o começo com a virada do próximo minuto para os registros baterem com o relógio.
        await AguardarProximoMinuto(token);

        while (!token.IsCancellationRequested)
        {
            var inicioMinuto = DateTimeOffset.UtcNow;
            var acumulador = new AcumuladorMinuto();

            try
            {
                await AmostrarDuranteOMinuto(acumulador, token);
            }
            catch (OperationCanceledException)
            {
                break;
            }

            var leitura = _contadores.DrenarContadores();
            GravarMinuto(inicioMinuto, acumulador, leitura);
        }

        _log.LogInformation("Amostrador encerrado.");
    }

    private async Task AmostrarDuranteOMinuto(AcumuladorMinuto acumulador, CancellationToken token)
    {
        // 60 / 5 = 12 subamostras. Cada subamostra "vale" SegundosPorAmostra segundos.
        var totalAmostras = 60 / SegundosPorAmostra;

        for (var i = 0; i < totalAmostras && !token.IsCancellationRequested; i++)
        {
            AmostrarUmaVez(acumulador);
            await Task.Delay(TimeSpan.FromSeconds(SegundosPorAmostra), token);
        }
    }

    private void AmostrarUmaVez(AcumuladorMinuto acumulador)
    {
        acumulador.TotalAmostras++;

        // Atividade nesta janela de amostra: houve input nos últimos SegundosPorAmostra?
        if (DetectorOcioso.SegundosDesdeUltimaEntrada() < SegundosPorAmostra)
            acumulador.AmostrasAtivas++;

        var janela = _inspetor.CapturarPrimeiroPlano();
        if (janela is null)
        {
            // Sem janela em primeiro plano costuma significar tela bloqueada/segura.
            acumulador.AmostrasBloqueado++;
            return;
        }

        var j = janela.Value;
        acumulador.Contabilizar(j.NomeProcesso);

        // Guarda título/domínio associados ao processo para usar se ele for o dominante.
        if (!acumulador.DadosPorProcesso.ContainsKey(j.NomeProcesso))
            acumulador.DadosPorProcesso[j.NomeProcesso] = ExtrairDados(j);
    }

    private DadosProcesso ExtrairDados(JanelaAtiva janela)
    {
        var sigiloso = _opcoes.ProcessosSigilosos.Contains(janela.NomeProcesso, StringComparer.OrdinalIgnoreCase);

        // Mensageria e cofres de senha: só executável e estado, nunca o título.
        var titulo = sigiloso
            ? _opcoes.TituloOmitido
            : HigienizadorTexto.LimparTitulo(janela.Titulo, _opcoes.RedigirNumerosLongos);

        var dominio = sigiloso ? null : _extrator.Extrair(janela);

        return new DadosProcesso(titulo, dominio);
    }

    private void GravarMinuto(DateTimeOffset inicioMinuto, AcumuladorMinuto acumulador, LeituraEntrada leitura)
    {
        // Fora da janela de coleta (ex.: madrugada) não grava nada.
        if (!_opcoes.DentroDaJanelaDeColeta(inicioMinuto.ToLocalTime().DateTime))
            return;

        var bloqueado = acumulador.TotalAmostras > 0
            && acumulador.AmostrasBloqueado >= acumulador.TotalAmostras;

        var (processoDominante, amostrasDominante) = acumulador.Dominante();

        // Minuto sem janela e sem input: registra ocioso genérico para preservar a linha do tempo.
        if (processoDominante is null)
        {
            processoDominante = bloqueado ? "sessao.bloqueada" : "sessao.ociosa";
            acumulador.DadosPorProcesso[processoDominante] = new DadosProcesso(string.Empty, null);
            amostrasDominante = acumulador.TotalAmostras;
        }

        var dados = acumulador.DadosPorProcesso.GetValueOrDefault(processoDominante, new DadosProcesso(string.Empty, null));

        var idle = leitura.Total == 0
            && DetectorOcioso.SegundosDesdeUltimaEntrada() >= _opcoes.SegundosParaOcioso;

        var registro = new RegistroAtividade
        {
            Instante = new DateTimeOffset(inicioMinuto.UtcDateTime.AddSeconds(-inicioMinuto.Second), TimeSpan.Zero),
            NomeProcesso = processoDominante,
            TituloJanela = dados.Titulo,
            Dominio = dados.Dominio,
            Ocioso = idle,
            Bloqueado = bloqueado,
            Teclas = leitura.Teclas,
            Cliques = leitura.Cliques,
            Rolagens = leitura.Rolagens,
            SegundosAtivos = ProporcaoParaSegundos(acumulador.AmostrasAtivas, acumulador.TotalAmostras),
            SegundosEmFoco = ProporcaoParaSegundos(amostrasDominante, acumulador.TotalAmostras),
            UsuarioSo = _usuarioSo
        };

        try
        {
            _buffer.Inserir(registro);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Não foi possível gravar o minuto no buffer local.");
        }
    }

    private static int ProporcaoParaSegundos(int parte, int total) =>
        total <= 0 ? 0 : (int)Math.Round(parte / (double)total * 60.0);

    private static async Task AguardarProximoMinuto(CancellationToken token)
    {
        var agora = DateTimeOffset.UtcNow;
        var proximo = new DateTimeOffset(agora.UtcDateTime.AddSeconds(-agora.Second).AddMinutes(1), TimeSpan.Zero);
        var espera = proximo - agora;
        if (espera > TimeSpan.Zero)
            await Task.Delay(espera, token);
    }

    /// <summary>Estado mutável acumulado ao longo de um minuto.</summary>
    private sealed class AcumuladorMinuto
    {
        public int TotalAmostras;
        public int AmostrasAtivas;
        public int AmostrasBloqueado;

        private readonly Dictionary<string, int> _contagem = new(StringComparer.OrdinalIgnoreCase);
        public Dictionary<string, DadosProcesso> DadosPorProcesso { get; } = new(StringComparer.OrdinalIgnoreCase);

        public void Contabilizar(string processo) =>
            _contagem[processo] = _contagem.GetValueOrDefault(processo) + 1;

        public (string? Processo, int Amostras) Dominante()
        {
            if (_contagem.Count == 0)
                return (null, 0);

            var melhor = _contagem.MaxBy(par => par.Value);
            return (melhor.Key, melhor.Value);
        }
    }

    private readonly record struct DadosProcesso(string Titulo, string? Dominio);
}
