using System.Text.Json.Serialization;

namespace Telemetria.Nucleo.Modelos;

/// <summary>Corpo do POST para a Edge Function registrar-dispositivo.</summary>
public sealed class PedidoMatricula
{
    [JsonPropertyName("enrollment_key")]
    public string ChaveMatricula { get; set; } = string.Empty;

    [JsonPropertyName("machine_name")]
    public string NomeMaquina { get; set; } = string.Empty;

    [JsonPropertyName("os_user")]
    public string UsuarioSo { get; set; } = string.Empty;

    [JsonPropertyName("agent_version")]
    public string VersaoAgente { get; set; } = string.Empty;

    /// <summary>
    /// Impressão estável da máquina (UUID do SMBIOS ou MachineGuid do registro).
    /// Evita duplicar dispositivo quando o agente é reinstalado.
    /// </summary>
    [JsonPropertyName("hardware_id")]
    public string IdHardware { get; set; } = string.Empty;
}

/// <summary>Resposta da Edge Function registrar-dispositivo.</summary>
public sealed class RespostaMatricula
{
    [JsonPropertyName("device_id")]
    public string IdDispositivo { get; set; } = string.Empty;

    [JsonPropertyName("device_token")]
    public string TokenDispositivo { get; set; } = string.Empty;
}

/// <summary>Corpo do POST para a Edge Function ingestao-lote.</summary>
public sealed class LoteTelemetria
{
    [JsonPropertyName("agent_version")]
    public string VersaoAgente { get; set; } = string.Empty;

    [JsonPropertyName("sent_at")]
    public DateTimeOffset EnviadoEm { get; set; } = DateTimeOffset.UtcNow;

    [JsonPropertyName("logs")]
    public List<RegistroAtividade> Registros { get; set; } = [];
}

/// <summary>Resposta da Edge Function ingestao-lote.</summary>
public sealed class RespostaIngestao
{
    [JsonPropertyName("accepted")]
    public int Aceitos { get; set; }

    [JsonPropertyName("duplicates")]
    public int Duplicados { get; set; }

    /// <summary>Intervalo de sincronização imposto pelo servidor (remote config).</summary>
    [JsonPropertyName("next_sync_minutes")]
    public int? ProximaSincronizacaoEmMinutos { get; set; }
}
