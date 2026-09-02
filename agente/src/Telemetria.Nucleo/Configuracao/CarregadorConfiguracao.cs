using Microsoft.Extensions.Configuration;
using Telemetria.Nucleo.Utilitarios;

namespace Telemetria.Nucleo.Configuracao;

/// <summary>
/// Monta a configuração dos dois hosts na mesma ordem de precedência:
/// appsettings.json (embarcado) &lt; configuracao.json em ProgramData (implantação) &lt;
/// variáveis de ambiente. Assim o TI pode empurrar config por GPO sem recompilar.
/// </summary>
public static class CarregadorConfiguracao
{
    public static IConfigurationRoot Montar(string diretorioBase)
    {
        var construtor = new ConfigurationBuilder()
            .SetBasePath(diretorioBase)
            .AddJsonFile("appsettings.json", optional: true, reloadOnChange: true);

        // Sempre adicionado, mesmo sem existir ainda: é ele que o servidor grava
        // quando a configuração muda no painel. Se só fosse incluído quando já
        // existisse, a primeira configuração remota nunca seria observada.
        construtor.AddJsonFile(CaminhosAplicacao.ConfiguracaoSobreposta, optional: true, reloadOnChange: true);

        construtor.AddEnvironmentVariables("TELEMETRIA_");

        return construtor.Build();
    }
}
