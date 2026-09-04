namespace Telemetria.Nucleo.Configuracao;

/// <summary>
/// Configuração compartilhada entre o serviço supervisor e o coletor de sessão.
/// Lida de appsettings.json e, quando presente, sobrescrita por
/// C:\ProgramData\TelemetriaProdutividade\configuracao.json (implantação por GPO/MDM).
/// </summary>
public sealed class OpcoesAgente
{
    public const string Secao = "Agente";

    /// <summary>URL do projeto Supabase. Ex.: https://xxxx.supabase.co</summary>
    public string UrlSupabase { get; set; } = string.Empty;

    /// <summary>
    /// Chave pública anon do Supabase. Serve apenas para atravessar o gateway das
    /// Edge Functions — não dá acesso a tabela nenhuma, o RLS bloqueia.
    /// </summary>
    public string ChaveAnonima { get; set; } = string.Empty;

    /// <summary>
    /// Chave de matrícula da organização. Usada UMA vez, no primeiro boot, para
    /// trocar por um token exclusivo do dispositivo. Depois disso pode ser removida.
    /// </summary>
    public string ChaveMatricula { get; set; } = string.Empty;

    /// <summary>Segundos sem entrada de mouse/teclado para o minuto ser marcado como ocioso.</summary>
    public int SegundosParaOcioso { get; set; } = 180;

    /// <summary>Intervalo entre sincronizações em lote com o Supabase.</summary>
    public int MinutosEntreSincronizacoes { get; set; } = 5;

    /// <summary>Quantidade máxima de registros por requisição POST.</summary>
    public int TamanhoLote { get; set; } = 120;

    /// <summary>Dias que um registro fica no buffer local antes de ser descartado por idade.</summary>
    public int DiasRetencaoLocal { get; set; } = 14;

    /// <summary>Coleta somente entre estes horários, formato HH:mm. Vazio nos dois = 24h.</summary>
    public string JanelaColetaInicio { get; set; } = string.Empty;

    public string JanelaColetaFim { get; set; } = string.Empty;

    /// <summary>Ícone de bandeja que informa o usuário de que a estação é monitorada (LGPD).</summary>
    public bool MostrarIconeBandeja { get; set; } = true;

    /// <summary>Substitui sequências de 6 ou mais dígitos no título da janela por "######".</summary>
    public bool RedigirNumerosLongos { get; set; } = true;

    /// <summary>Extrai o domínio da barra de endereço via UI Automation.</summary>
    public bool ExtrairDominioNavegador { get; set; } = true;

    /// <summary>Segundos de espera máxima por uma consulta de UI Automation antes de desistir.</summary>
    public int TimeoutAutomacaoSegundos { get; set; } = 2;

    /// <summary>Executáveis tratados como navegador para extração de domínio.</summary>
    public string[] ProcessosNavegador { get; set; } =
    [
        "chrome.exe", "msedge.exe", "firefox.exe",
        "brave.exe", "opera.exe", "vivaldi.exe"
    ];

    /// <summary>
    /// Processos cujo título de janela NUNCA é gravado. Registra-se apenas o
    /// executável e o estado foco/ocioso, conforme a diretriz de mensageria.
    /// </summary>
    public string[] ProcessosSigilosos { get; set; } =
    [
        "whatsapp.exe", "telegram.exe", "signal.exe", "discord.exe",
        "slack.exe", "keepass.exe", "keepassxc.exe",
        "1password.exe", "bitwarden.exe"
    ];

    public string TituloOmitido { get; set; } = "(titulo nao coletado)";

    /// <summary>Verdadeiro quando o instante informado cai dentro da janela de coleta configurada.</summary>
    public bool DentroDaJanelaDeColeta(DateTime instanteLocal)
    {
        if (string.IsNullOrWhiteSpace(JanelaColetaInicio) || string.IsNullOrWhiteSpace(JanelaColetaFim))
            return true;

        if (!TimeOnly.TryParse(JanelaColetaInicio, out var inicio) ||
            !TimeOnly.TryParse(JanelaColetaFim, out var fim))
            return true;

        var agora = TimeOnly.FromDateTime(instanteLocal);

        // Janela que atravessa a meia-noite (ex.: 22:00 -> 06:00).
        return inicio <= fim
            ? agora >= inicio && agora <= fim
            : agora >= inicio || agora <= fim;
    }
}
