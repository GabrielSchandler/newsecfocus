using Microsoft.Extensions.Configuration;
using Telemetria.Nucleo.Utilitarios;

namespace Telemetria.Nucleo.Configuracao;

/// <summary>
/// Monta a configuração dos dois hosts na mesma ordem de precedência:
/// appsettings.json (embarcado) &lt; registro do Windows (gravado pelo instalador) &lt;
/// configuracao.json em ProgramData (GPO e configuração remota) &lt; variáveis de
/// ambiente. Assim o mesmo binário serve a todas as empresas e o TI empurra
/// configuração sem recompilar nada.
/// </summary>
public static class CarregadorConfiguracao
{
    public static IConfigurationRoot Montar(string diretorioBase)
    {
        var construtor = new ConfigurationBuilder()
            .SetBasePath(diretorioBase)
            .AddJsonFile("appsettings.json", optional: true, reloadOnChange: true);

        // O instalador grava a identidade da empresa no registro. Fica acima do
        // appsettings (que sai de fábrica com placeholder) e abaixo do arquivo
        // de ProgramData, para a configuração remota continuar mandando.
        if (OperatingSystem.IsWindows())
            construtor.AddInMemoryCollection(ConfiguracaoDoRegistro.Ler());

        // Sempre adicionado, mesmo sem existir ainda: é ele que o servidor grava
        // quando a configuração muda no painel. Se só fosse incluído quando já
        // existisse, a primeira configuração remota nunca seria observada.
        construtor.AddJsonFile(CaminhosAplicacao.ConfiguracaoSobreposta, optional: true, reloadOnChange: true);

        construtor.AddEnvironmentVariables("TELEMETRIA_");

        return construtor.Build();
    }
}
