using System.Text.Json.Serialization;

namespace Telemetria.Nucleo.Modelos;

/// <summary>
/// Marco do ciclo de vida da estação: agente subiu, agente parou, máquina
/// dormiu, máquina acordou, usuário desligou.
///
/// Existe para responder uma pergunta que a telemetria sozinha não responde:
/// quando a coleta para, foi porque a máquina desligou ou porque o agente
/// quebrou? Sem isso, as duas situações são silêncio idêntico no painel — e a
/// aderência à jornada pune quem estava com o computador desligado igual a
/// quem estava presente sem produzir.
///
/// Não é medição de tempo e nunca entra em cálculo de produtividade.
/// </summary>
public sealed class EventoEstacao
{
    /// <summary>Id no SQLite local. Não vai para o servidor.</summary>
    [JsonIgnore]
    public long IdLocal { get; set; }

    [JsonPropertyName("tipo")]
    public string Tipo { get; set; } = string.Empty;

    [JsonPropertyName("momento")]
    public DateTimeOffset Momento { get; set; }

    [JsonPropertyName("versao")]
    public string? Versao { get; set; }

    [JsonPropertyName("detalhe")]
    public string? Detalhe { get; set; }
}

/// <summary>Tipos aceitos — espelham o enum tipo_evento_estacao no banco.</summary>
public static class TiposEvento
{
    public const string AgenteIniciado = "AGENTE_INICIADO";
    public const string AgenteParado = "AGENTE_PARADO";
    public const string Suspensa = "SUSPENSA";
    public const string Retomada = "RETOMADA";
    public const string Desligando = "DESLIGANDO";
}
