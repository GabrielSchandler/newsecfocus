using System.Text.RegularExpressions;

namespace Telemetria.Nucleo.Utilitarios;

/// <summary>
/// Minimização de dados aplicada antes de qualquer gravação (LGPD, art. 6º, III).
/// Tira e-mails, números longos e sufixo de aplicativo do título da janela e
/// normaliza URL para apenas o host.
/// </summary>
public static partial class HigienizadorTexto
{
    private const int TamanhoMaximoTitulo = 180;

    [GeneratedRegex(@"\d{6,}", RegexOptions.CultureInvariant)]
    private static partial Regex NumerosLongos();

    [GeneratedRegex(@"[\w\.\-\+]+@[\w\-]+\.[\w\.\-]+", RegexOptions.CultureInvariant)]
    private static partial Regex Emails();

    [GeneratedRegex(@"\s+", RegexOptions.CultureInvariant)]
    private static partial Regex EspacosRepetidos();

    private static readonly string[] SufixosConhecidos =
    [
        " - Google Chrome", " — Google Chrome",
        " - Microsoft Edge", " — Microsoft Edge",
        " — Mozilla Firefox", " - Mozilla Firefox",
        " - Brave", " — Brave",
        " - Opera", " - Vivaldi"
    ];

    /// <summary>Remove sufixo de aplicativo, e-mails, números longos e normaliza espaços.</summary>
    public static string LimparTitulo(string? titulo, bool redigirNumeros)
    {
        if (string.IsNullOrWhiteSpace(titulo))
            return string.Empty;

        var texto = titulo.Trim();

        foreach (var sufixo in SufixosConhecidos)
        {
            if (texto.EndsWith(sufixo, StringComparison.OrdinalIgnoreCase))
            {
                texto = texto[..^sufixo.Length].TrimEnd(' ', '-', '—', '–', '|');
                break;
            }
        }

        texto = Emails().Replace(texto, "[email]");

        if (redigirNumeros)
            texto = NumerosLongos().Replace(texto, "######");

        texto = EspacosRepetidos().Replace(texto, " ").Trim();

        return texto.Length > TamanhoMaximoTitulo
            ? texto[..TamanhoMaximoTitulo]
            : texto;
    }

    /// <summary>Normaliza uma URL crua para apenas o host, sem www, sem caminho e sem query.</summary>
    public static string? ExtrairDominio(string? urlBruta)
    {
        if (string.IsNullOrWhiteSpace(urlBruta))
            return null;

        var candidata = urlBruta.Trim();

        if (!candidata.Contains("://", StringComparison.Ordinal))
            candidata = "https://" + candidata;

        if (!Uri.TryCreate(candidata, UriKind.Absolute, out var uri))
            return null;

        if (uri.Scheme is not ("http" or "https"))
            return null;

        var host = uri.Host;
        if (string.IsNullOrEmpty(host) || !host.Contains('.'))
            return null;

        if (host.StartsWith("www.", StringComparison.OrdinalIgnoreCase))
            host = host[4..];

        return host.ToLowerInvariant();
    }
}
