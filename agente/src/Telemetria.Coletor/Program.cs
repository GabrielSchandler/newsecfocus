// System.IO explícito: este projeto liga UseWPF junto com UseWindowsForms, e essa
// combinação deixa System.IO de fora dos implicit usings.
using System.IO;
using System.Reflection;
using System.Windows.Forms;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Telemetria.Coletor.Interface;
using Telemetria.Coletor.Monitoramento;
using Telemetria.Nucleo.Configuracao;
using Telemetria.Nucleo.Dados;
using Telemetria.Nucleo.Seguranca;
using Telemetria.Nucleo.Utilitarios;

namespace Telemetria.Coletor;

/// <summary>
/// Processo de coleta que roda NA SESSÃO DO USUÁRIO logado (não na Sessão 0 do serviço).
/// Só aqui os hooks de baixo nível, GetForegroundWindow e GetLastInputInfo enxergam o
/// usuário real. O serviço supervisor é quem inicia e mantém uma instância deste
/// processo por sessão interativa ativa.
///
/// Fluxo:
///   1. Instala os hooks de teclado/mouse na thread de UI (que roda a bomba de mensagens).
///   2. Sobe o ícone de bandeja (transparência LGPD).
///   3. Roda o amostrador numa Task de fundo, gravando um registro por minuto no buffer.
///   4. Application.Run mantém a bomba viva até logoff/encerramento.
/// </summary>
internal static class Program
{
    [STAThread]
    private static void Main()
    {
        // Evita duas instâncias do coletor na mesma sessão (o serviço poderia lançar em duplicidade).
        using var travaSessao = new Mutex(initiallyOwned: true,
            $"Local\\TelemetriaColetor_{Environment.UserName}", out var novo);
        if (!novo)
            return;

        SqlcipherBootstrap.Garantir();
        CaminhosAplicacao.GarantirEstrutura();

        ApplicationConfiguration.Initialize();

        var config = CarregadorConfiguracao.Montar(AppContext.BaseDirectory);
        var opcoes = new OpcoesAgente();
        config.GetSection(OpcoesAgente.Secao).Bind(opcoes);

        using var loggerFactory = CriarLogger();
        var logGeral = loggerFactory.CreateLogger("Coletor");

        byte[] chave;
        try
        {
            chave = CofreLocal.ObterOuCriarChaveBanco(CaminhosAplicacao.ChaveBanco);
        }
        catch (Exception ex)
        {
            logGeral.LogCritical(ex, "Sem acesso à chave do buffer local. Coletor não iniciará.");
            return;
        }

        var buffer = new BufferTelemetria(CaminhosAplicacao.BancoLocal, chave,
            loggerFactory.CreateLogger<BufferTelemetria>());
        buffer.Inicializar();

        var contadores = new ContadoresEntrada(loggerFactory.CreateLogger<ContadoresEntrada>());
        var inspetor = new InspetorJanela(loggerFactory.CreateLogger<InspetorJanela>());
        var extrator = new ExtratorDominio(opcoes, loggerFactory.CreateLogger<ExtratorDominio>());
        var amostrador = new AmostradorAtividade(opcoes, buffer, inspetor, extrator, contadores,
            loggerFactory.CreateLogger<AmostradorAtividade>());

        // Os hooks precisam ser instalados na thread que roda o Application.Run (esta).
        contadores.Instalar();

        var versao = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "1.0.0";
        IconeBandeja? bandeja = opcoes.MostrarIconeBandeja ? new IconeBandeja(versao) : null;

        using var cts = new CancellationTokenSource();
        var tarefaAmostragem = Task.Run(() => amostrador.ExecutarAsync(cts.Token));

        // Encerra de forma limpa em logoff/shutdown da sessão.
        SystemEvents_HookSessionEnd(cts);

        Application.ApplicationExit += (_, _) =>
        {
            cts.Cancel();
            try { tarefaAmostragem.Wait(TimeSpan.FromSeconds(3)); } catch { /* melhor esforço */ }
            bandeja?.Dispose();
            contadores.Dispose();
        };

        logGeral.LogInformation("Coletor pronto. Buffer com {n} registros pendentes.", buffer.ContarPendentes());
        Application.Run();
    }

    private static void SystemEvents_HookSessionEnd(CancellationTokenSource cts)
    {
        Microsoft.Win32.SystemEvents.SessionEnding += (_, _) =>
        {
            cts.Cancel();
            Application.Exit();
        };
    }

    private static ILoggerFactory CriarLogger()
    {
        return LoggerFactory.Create(construtor =>
        {
            construtor.SetMinimumLevel(LogLevel.Information);
            construtor.AddProvider(new ProvedorLogArquivo(
                Path.Combine(CaminhosAplicacao.PastaLogs, "coletor.log")));
        });
    }
}
