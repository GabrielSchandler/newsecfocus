using System.Reflection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Hosting.WindowsServices;
using Microsoft.Extensions.Logging;
using Telemetria.Nucleo.Configuracao;
using Telemetria.Nucleo.Dados;
using Telemetria.Nucleo.Seguranca;
using Telemetria.Nucleo.Utilitarios;
using Telemetria.Servico.Atualizacao;
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

        // O script que troca de versao mora em ProgramData, fora da pasta de
        // instalacao, e e republicado aqui a cada boot. A ordem importa: quem
        // executa a troca e sempre o script da versao que JA PROVOU que sobe,
        // nunca o da versao nova, que ainda nao rodou nesta maquina.
        PublicarScriptDeTroca();

        var construtor = Host.CreateApplicationBuilder(args);

        // Mesma precedencia do Coletor (appsettings.json < registro gravado pelo
        // instalador < configuracao.json em ProgramData < variaveis de ambiente).
        // Ate 03/09/2026 este bloco duplicava essa logica na mao, SEM ler o
        // registro — so o Coletor usava CarregadorConfiguracao. Bug real: numa
        // instalacao de verdade, o servico (quem fala com o Supabase) nunca via a
        // URL/chaves que o Instalar.ps1 grava, so o appsettings.json de fabrica
        // (com placeholder). Corrigido reaproveitando o mesmo carregador.
        construtor.Configuration.AddConfiguration(
            CarregadorConfiguracao.Montar(AppContext.BaseDirectory));

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

        // O atualizador usa HttpClient próprio: baixa dezenas de megabytes do
        // Storage e não deve dividir tempo limite nem cabeçalhos com o cliente
        // de telemetria, que troca pacotes pequenos e frequentes.
        construtor.Services.AddHttpClient("atualizacao", c => c.Timeout = TimeSpan.FromMinutes(10));
        construtor.Services.AddSingleton(sp => new AtualizadorAgente(
            sp.GetRequiredService<IHttpClientFactory>().CreateClient("atualizacao"),
            sp.GetRequiredService<ILogger<AtualizadorAgente>>(),
            Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.0.0"));

        construtor.Services.AddHostedService<SupervisorSessoes>();
        construtor.Services.AddHostedService<WorkerSincronizacao>();

        var host = construtor.Build();

        // Primeira linha util do log: com atualizacao automatica, "qual versao
        // esta rodando nesta maquina?" vira a pergunta mais frequente do
        // suporte, e a resposta tem de estar no topo do arquivo.
        host.Services.GetRequiredService<ILoggerFactory>()
            .CreateLogger("Agente")
            .LogInformation("NewSec Focus {v} iniciando de {pasta}",
                Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "?",
                AppContext.BaseDirectory);

        host.Run();
    }

    /// <summary>
    /// Copia o Trocar.ps1 desta versao para ProgramData. Idempotente e
    /// silencioso: falhar aqui nao pode impedir o servico de subir e coletar.
    /// </summary>
    private static void PublicarScriptDeTroca()
    {
        try
        {
            var origem = Path.Combine(AppContext.BaseDirectory, "Trocar.ps1");
            if (File.Exists(origem))
                File.Copy(origem, CaminhosAplicacao.ScriptTroca, overwrite: true);
        }
        catch
        {
            // Sem o script, a atualizacao automatica nao acontece e a maquina
            // segue coletando normalmente. E o modo de falhar correto.
        }
    }
}
