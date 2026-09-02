using System.Text.Json;
using System.Text.Json.Serialization;
using Telemetria.Nucleo.Utilitarios;

namespace Telemetria.Nucleo.Configuracao;

/// <summary>
/// Grava a configuração vinda do servidor em
/// <c>C:\ProgramData\TelemetriaProdutividade\configuracao.json</c>, o mesmo
/// arquivo que o TI usaria por GPO.
///
/// Escrever em disco, em vez de guardar em memória, resolve duas coisas de uma
/// vez: o COLETOR é outro processo e lê esse arquivo sozinho, e a configuração
/// sobrevive a reinício da máquina sem depender de uma nova sincronização.
///
/// A escrita é atômica (arquivo temporário + move) para uma queda de energia no
/// meio não deixar o agente com um JSON pela metade — o que o impediria de
/// subir.
/// </summary>
public static class AplicadorConfiguracao
{
    private static readonly JsonSerializerOptions Formato = new()
    {
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    /// <summary>Assinatura da última configuração aplicada, guardada ao lado do arquivo.</summary>
    private static string CaminhoAssinatura =>
        Path.Combine(CaminhosAplicacao.Raiz, "configuracao.assinatura");

    /// <summary>
    /// Aplica a configuração se ela for diferente da última. Devolve true quando
    /// gravou algo — o chamador usa isso para registrar no log.
    /// </summary>
    public static bool Aplicar(ConfiguracaoRemota? remota, OpcoesAgente opcoes)
    {
        if (remota is null)
            return false;

        // Sem assinatura não dá para saber se mudou: aplica para não ignorar
        // silenciosamente uma configuração legítima de servidor mais antigo.
        var assinatura = remota.Assinatura;
        if (!string.IsNullOrEmpty(assinatura) && LerAssinatura() == assinatura)
            return false;

        var mesclada = Mesclar(remota, opcoes);
        GravarAtomico(CaminhosAplicacao.ConfiguracaoSobreposta, Serializar(mesclada));

        if (!string.IsNullOrEmpty(assinatura))
            GravarAtomico(CaminhoAssinatura, assinatura);

        // Reflete na instância em uso para valer já neste ciclo, sem esperar o
        // recarregamento periódico.
        CopiarPara(mesclada, opcoes);
        return true;
    }

    /// <summary>
    /// Campo nulo no servidor mantém o que já vale na máquina. Assim uma
    /// resposta parcial nunca zera configuração boa.
    /// </summary>
    private static OpcoesAgente Mesclar(ConfiguracaoRemota r, OpcoesAgente atual) => new()
    {
        // Credenciais e URL nunca vêm do servidor: continuam do appsettings local.
        UrlSupabase = atual.UrlSupabase,
        ChaveAnonima = atual.ChaveAnonima,
        ChaveMatricula = atual.ChaveMatricula,

        MinutosEntreSincronizacoes = Faixa(r.MinutosEntreSincronizacoes, 5, 720, atual.MinutosEntreSincronizacoes),
        SegundosParaOcioso = Faixa(r.SegundosParaOcioso, 30, 3600, atual.SegundosParaOcioso),
        TamanhoLote = Faixa(r.TamanhoLote, 10, 500, atual.TamanhoLote),
        DiasRetencaoLocal = Faixa(r.DiasRetencaoLocal, 1, 90, atual.DiasRetencaoLocal),

        JanelaColetaInicio = r.JanelaColetaInicio ?? atual.JanelaColetaInicio,
        JanelaColetaFim = r.JanelaColetaFim ?? atual.JanelaColetaFim,

        ExtrairDominioNavegador = r.ExtrairDominioNavegador ?? atual.ExtrairDominioNavegador,
        MostrarIconeBandeja = r.MostrarIconeBandeja ?? atual.MostrarIconeBandeja,
        RedigirNumerosLongos = r.RedigirNumerosLongos ?? atual.RedigirNumerosLongos,

        ProcessosSigilosos = r.ProcessosSigilosos is { Length: > 0 }
            ? r.ProcessosSigilosos
            : atual.ProcessosSigilosos,

        // Não vêm do servidor por enquanto.
        ProcessosNavegador = atual.ProcessosNavegador,
        TimeoutAutomacaoSegundos = atual.TimeoutAutomacaoSegundos,
        TituloOmitido = atual.TituloOmitido,
    };

    /// <summary>Valor do servidor só vale se estiver dentro da faixa aceitável.</summary>
    private static int Faixa(int? valor, int minimo, int maximo, int padrao) =>
        valor is { } v && v >= minimo && v <= maximo ? v : padrao;

    private static void CopiarPara(OpcoesAgente origem, OpcoesAgente destino)
    {
        destino.MinutosEntreSincronizacoes = origem.MinutosEntreSincronizacoes;
        destino.SegundosParaOcioso = origem.SegundosParaOcioso;
        destino.TamanhoLote = origem.TamanhoLote;
        destino.DiasRetencaoLocal = origem.DiasRetencaoLocal;
        destino.JanelaColetaInicio = origem.JanelaColetaInicio;
        destino.JanelaColetaFim = origem.JanelaColetaFim;
        destino.ExtrairDominioNavegador = origem.ExtrairDominioNavegador;
        destino.MostrarIconeBandeja = origem.MostrarIconeBandeja;
        destino.RedigirNumerosLongos = origem.RedigirNumerosLongos;
        destino.ProcessosSigilosos = origem.ProcessosSigilosos;
    }

    /// <summary>
    /// O arquivo precisa ter a mesma forma que o CarregadorConfiguracao espera:
    /// um objeto "Agente" com as propriedades da OpcoesAgente.
    /// </summary>
    private static string Serializar(OpcoesAgente opcoes) =>
        JsonSerializer.Serialize(new { Agente = opcoes }, Formato);

    private static string? LerAssinatura()
    {
        try
        {
            return File.Exists(CaminhoAssinatura) ? File.ReadAllText(CaminhoAssinatura).Trim() : null;
        }
        catch
        {
            return null;
        }
    }

    private static void GravarAtomico(string caminho, string conteudo)
    {
        CaminhosAplicacao.GarantirEstrutura();
        var temporario = caminho + ".tmp";
        File.WriteAllText(temporario, conteudo);
        File.Move(temporario, caminho, overwrite: true);
    }
}
