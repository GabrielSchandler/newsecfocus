using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Hosting.WindowsServices;
using Microsoft.Extensions.Logging;
using Telemetria.Nucleo.Configuracao;
using Telemetria.Nucleo.Dados;
using Telemetria.Nucleo.Seguranca;
using Telemetria.Nucleo.Utilitarios;
using Telemetria.Servico.Sincronizacao;
using Telemetria.Servico.Supervisao;

namespace Telemetria.Servico;

/// <summary>
/// Serviço supervisor. Roda como Windows Service (SYSTEM, Sessão 0) e faz três coisas:
///   1. Reconcilia sessões: garante um coletor rodando na sessão de cada usuário logado.
///   2. Sincroniza o buffer local com o Supabase em lotes.
///   3. Cuida da matrícula da máquina.
/// A coleta de fato (hooks, foreground) acontece no coletor, na sessão do usuário.
/// </summary>
internal static class Program
{
    private static void Main(string[] args)
    {
        SqlcipherBootstrap.Garantir();
        CaminhosAplicacao.GarantirEstrutura();

        var construtor = Host.CreateApplicationBuilder(args);

        construtor.Configuration.AddJsonFile(
            Path.Combine(AppContext.BaseDirectory, "appsettings.json"), optional: true, reloadOnChange: true);
        if (File.Exists(CaminhosAplicacao.ConfiguracaoSobreposta))
            construtor.Configuration.AddJsonFile(CaminhosAplicacao.ConfiguracaoSobreposta, optional: true, reloadOnChange: true);
        construtor.Configuration.AddEnvironmentVariables("TELEMETRIA_");

        // Roda como serviço do Windows quando instalado; como console quando depurado.
        construtor.Services.AddWindowsService(opcoes => opcoes.ServiceName = "TelemetriaProdutividade");

        construtor.Logging.ClearProviders();
        construtor.Logging.AddProvider(new ProvedorLogArquivo(
            Path.Combine(CaminhosAplicacao.PastaLogs, "servico.log")));
        if (!WindowsServiceHelpers.IsWindowsService())
            construtor.Logging.AddSimpleConsole(o => o.SingleLine = true);

        var opcoes = new OpcoesAgente();
        construtor.Configuration.GetSection(OpcoesAgente.Secao).Bind(opcoes);
        construtor.Services.AddSingleton(opcoes);

        // Buffer local compartilhado com o coletor (mesma chave DPAPI de máquina).
        construtor.Services.AddSingleton(sp =>
        {
            var chave = CofreLocal.ObterOuCriarChaveBanco(CaminhosAplicacao.ChaveBanco);
            var buffer = new BufferTelemetria(CaminhosAplicacao.BancoLocal, chave,
                sp.GetRequiredService<ILogger<BufferTelemetria>>());
            buffer.Inicializar();
            return buffer;
        });

        // Lançador de sessão precisa do caminho do executável do coletor, ao lado do serviço.
        construtor.Services.AddSingleton(sp =>
        {
            var caminhoColetor = Path.Combine(AppContext.BaseDirectory, "coletor", "Telemetria.Coletor.exe");
            return new LancadorSessao(caminhoColetor, sp.GetRequiredService<ILogger<LancadorSessao>>());
        });

        construtor.Services.AddHttpClient<ClienteSupabase>();
        construtor.Services.AddSingleton<GerenciadorMatricula>();

        construtor.Services.AddHostedService<SupervisorSessoes>();
        construtor.Services.AddHostedService<WorkerSincronizacao>();

        var host = construtor.Build();
        host.Run();
    }
}
