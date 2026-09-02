using System.Text.Json.Serialization;

namespace Telemetria.Nucleo.Configuracao;

/// <summary>
/// Configuração que o servidor manda na resposta da matrícula e de cada
/// sincronização. É o que permite mudar como a frota coleta e envia sem visitar
/// máquina por máquina.
///
/// Só cobre PARÂMETRO. Trocar o binário — corrigir um bug, coletar um campo
/// novo — continua exigindo reinstalação.
///
/// Todos os campos são anuláveis de propósito: servidor antigo, resposta
/// truncada ou campo que ainda não existe simplesmente não sobrescrevem o que
/// está valendo na máquina.
/// </summary>
public sealed class ConfiguracaoRemota
{
    [JsonPropertyName("minutos_entre_sincronizacoes")]
    public int? MinutosEntreSincronizacoes { get; set; }

    [JsonPropertyName("segundos_para_ocioso")]
    public int? SegundosParaOcioso { get; set; }

    [JsonPropertyName("janela_coleta_inicio")]
    public string? JanelaColetaInicio { get; set; }

    [JsonPropertyName("janela_coleta_fim")]
    public string? JanelaColetaFim { get; set; }

    [JsonPropertyName("extrair_dominio_navegador")]
    public bool? ExtrairDominioNavegador { get; set; }

    [JsonPropertyName("mostrar_icone_bandeja")]
    public bool? MostrarIconeBandeja { get; set; }

    [JsonPropertyName("redigir_numeros_longos")]
    public bool? RedigirNumerosLongos { get; set; }

    [JsonPropertyName("tamanho_lote")]
    public int? TamanhoLote { get; set; }

    [JsonPropertyName("dias_retencao_local")]
    public int? DiasRetencaoLocal { get; set; }

    [JsonPropertyName("processos_sigilosos")]
    public string[]? ProcessosSigilosos { get; set; }

    /// <summary>
    /// Muda a cada alteração feita no painel. O agente compara com a última que
    /// aplicou e só regrava o arquivo quando difere — evita escrita em disco a
    /// cada hora em toda a frota.
    /// </summary>
    [JsonPropertyName("assinatura")]
    public string? Assinatura { get; set; }
}
