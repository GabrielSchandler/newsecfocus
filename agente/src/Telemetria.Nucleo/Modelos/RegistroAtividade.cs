using System.Text.Json.Serialization;

namespace Telemetria.Nucleo.Modelos;

/// <summary>
/// Um minuto de atividade de uma estação. Corresponde a uma linha de
/// activity_logs no Supabase. Os nomes JSON seguem as colunas do banco.
/// </summary>
public sealed class RegistroAtividade
{
    /// <summary>Chave local do buffer SQLite. Não é enviada ao servidor.</summary>
    [JsonIgnore]
    public long IdLocal { get; set; }

    /// <summary>Início do minuto amostrado, sempre em UTC.</summary>
    [JsonPropertyName("timestamp")]
    public DateTimeOffset Instante { get; set; }

    [JsonPropertyName("process_name")]
    public string NomeProcesso { get; set; } = string.Empty;

    [JsonPropertyName("window_title")]
    public string TituloJanela { get; set; } = string.Empty;

    [JsonPropertyName("domain")]
    public string? Dominio { get; set; }

    [JsonPropertyName("is_idle")]
    public bool Ocioso { get; set; }

    [JsonPropertyName("keystrokes_count")]
    public int Teclas { get; set; }

    [JsonPropertyName("mouse_clicks_count")]
    public int Cliques { get; set; }

    [JsonPropertyName("scroll_count")]
    public int Rolagens { get; set; }

    /// <summary>Segundos do minuto em que houve entrada de fato (0 a 60).</summary>
    [JsonPropertyName("active_seconds")]
    public int SegundosAtivos { get; set; }

    /// <summary>Segundos do minuto em que o processo dominante esteve em foco (0 a 60).</summary>
    [JsonPropertyName("foreground_seconds")]
    public int SegundosEmFoco { get; set; }

    /// <summary>Usuário Windows da sessão que gerou o registro (DOMINIO\usuario).</summary>
    [JsonPropertyName("os_user")]
    public string UsuarioSo { get; set; } = string.Empty;

    /// <summary>Se a tela estava bloqueada durante o minuto.</summary>
    [JsonPropertyName("is_locked")]
    public bool Bloqueado { get; set; }
}
