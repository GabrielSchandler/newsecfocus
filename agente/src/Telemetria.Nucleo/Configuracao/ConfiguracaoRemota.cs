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

    /// <summary>
    /// Versão que esta máquina deveria estar rodando. Nulo quando nenhuma versão
    /// foi publicada — e aí o agente fica onde está.
    ///
    /// Fica FORA da assinatura de propósito: atualizar é decidido comparando
    /// versões, não detectando mudança de configuração de coleta.
    /// </summary>
    [JsonPropertyName("atualizacao")]
    public AlvoAtualizacao? Atualizacao { get; set; }
}

/// <summary>
/// Para onde a estação deve ir.
///
/// O sha256 é do MANIFESTO, não de um binário: o manifesto lista cada arquivo
/// com o próprio hash. Conferir o manifesto contra este valor, e depois cada
/// arquivo contra o manifesto, fecha a corrente desde o banco — onde só a
/// plataforma escreve — até o byte gravado em disco.
/// </summary>
public sealed class AlvoAtualizacao
{
    [JsonPropertyName("versao")]
    public string? Versao { get; set; }

    [JsonPropertyName("url")]
    public string? Url { get; set; }

    [JsonPropertyName("sha256")]
    public string? Sha256 { get; set; }

    [JsonPropertyName("tamanho_bytes")]
    public long? TamanhoBytes { get; set; }
}
