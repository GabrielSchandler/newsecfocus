using Microsoft.Win32;
using System.Runtime.Versioning;

namespace Telemetria.Nucleo.Configuracao;

/// <summary>
/// Lê URL, chave anônima e chave de matrícula do registro do Windows, em
/// <c>HKLM\SOFTWARE\NewSecFocus</c>.
///
/// É por aqui que o instalador entrega a identidade da empresa. Isso resolve o
/// problema de implantação em frota: o MSI é o mesmo para todos os clientes, e
/// a chave vai como parâmetro na linha de comando —
///
///     msiexec /i NewSecFocus.msi /qn CHAVEMATRICULA=abc URLSUPABASE=https://...
///
/// — o que permite empurrar por GPO ou Intune para 30 máquinas de uma vez, sem
/// editar arquivo em nenhuma delas.
///
/// Precedência: appsettings.json (embarcado) &lt; REGISTRO (instalador) &lt;
/// configuracao.json em ProgramData (configuração remota e GPO) &lt; variáveis
/// de ambiente.
/// </summary>
[SupportedOSPlatform("windows")]
public static class ConfiguracaoDoRegistro
{
    private const string Caminho = @"SOFTWARE\NewSecFocus";

    /// <summary>
    /// Devolve os valores encontrados no formato que o ConfigurationBuilder
    /// espera. Chave ausente simplesmente não entra — quem não usa o instalador
    /// continua funcionando pelo appsettings.json.
    /// </summary>
    public static Dictionary<string, string?> Ler()
    {
        var valores = new Dictionary<string, string?>();

        try
        {
            // O serviço roda em 64 bits; a view explícita evita cair na
            // redireção WOW6432Node e não achar o que o instalador gravou.
            using var baseChave = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64);
            using var chave = baseChave.OpenSubKey(Caminho);

            if (chave is null)
                return valores;

            Copiar(chave, valores, "UrlSupabase");
            Copiar(chave, valores, "ChaveAnonima");
            Copiar(chave, valores, "ChaveMatricula");
        }
        catch
        {
            // Sem permissão ou registro indisponível: segue com o que houver em
            // arquivo. Nunca impedir o agente de subir por causa disto.
        }

        return valores;
    }

    private static void Copiar(RegistryKey chave, Dictionary<string, string?> destino, string nome)
    {
        if (chave.GetValue(nome) is string valor && !string.IsNullOrWhiteSpace(valor))
            destino[$"{OpcoesAgente.Secao}:{nome}"] = valor.Trim();
    }
}
