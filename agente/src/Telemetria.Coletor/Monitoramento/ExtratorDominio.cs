using System.Collections.Concurrent;
using System.Windows.Automation;
using Microsoft.Extensions.Logging;
using Telemetria.Nucleo.Configuracao;
using Telemetria.Nucleo.Utilitarios;

namespace Telemetria.Coletor.Monitoramento;

/// <summary>
/// Extrai apenas o DOMÍNIO da barra de endereço de um navegador via UI Automation.
/// Nunca lê caminho, parâmetros de query nem conteúdo da página — só o host.
///
/// Três defesas contra o custo e a instabilidade da UI Automation:
///  1. Só age em processos marcados como navegador.
///  2. Roda a busca numa thread STA dedicada com timeout rígido; se a UIA travar,
///     a thread é abandonada e devolvemos null, sem prender o amostrador.
///  3. Cacheia por (processo + título) — enquanto o usuário fica na mesma página,
///     não reconsulta a árvore de automação.
/// </summary>
public sealed class ExtratorDominio
{
    private readonly OpcoesAgente _opcoes;
    private readonly ILogger<ExtratorDominio> _log;
    private readonly ConcurrentDictionary<string, string?> _cache = new();

    // Nomes localizados comuns da barra de endereço, em minúsculas.
    private static readonly string[] PistasBarraEndereco =
    [
        "address and search bar", "address", "barra de endereços",
        "endereço", "search or enter address", "pesquisar ou inserir endereço",
        "url", "location"
    ];

    public ExtratorDominio(OpcoesAgente opcoes, ILogger<ExtratorDominio> log)
    {
        _opcoes = opcoes;
        _log = log;
    }

    public bool EhNavegador(string nomeProcesso) =>
        _opcoes.ProcessosNavegador.Contains(nomeProcesso, StringComparer.OrdinalIgnoreCase);

    public string? Extrair(JanelaAtiva janela)
    {
        if (!_opcoes.ExtrairDominioNavegador || !EhNavegador(janela.NomeProcesso))
            return null;

        var chaveCache = janela.NomeProcesso + "|" + janela.Titulo;
        if (_cache.TryGetValue(chaveCache, out var cacheado))
            return cacheado;

        var dominio = ExecutarComTimeout(janela.Handle, _opcoes.TimeoutAutomacaoSegundos);

        // Cache limitado para não crescer sem fim numa sessão longa de navegação.
        if (_cache.Count > 256)
            _cache.Clear();
        _cache[chaveCache] = dominio;

        return dominio;
    }

    private string? ExecutarComTimeout(IntPtr hWnd, int timeoutSegundos)
    {
        string? resultado = null;
        Exception? falha = null;

        var thread = new Thread(() =>
        {
            try
            {
                resultado = BuscarDominioNaArvore(hWnd);
            }
            catch (Exception ex)
            {
                falha = ex;
            }
        })
        {
            IsBackground = true,
            Name = "extrator-dominio-uia"
        };

        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();

        if (!thread.Join(TimeSpan.FromSeconds(timeoutSegundos)))
        {
            // UIA travou nesta janela: desiste sem bloquear o amostrador.
            _log.LogDebug("UI Automation excedeu {s}s ao ler o domínio; ignorando.", timeoutSegundos);
            return null;
        }

        if (falha is not null)
            _log.LogDebug(falha, "Falha ao extrair domínio via UI Automation.");

        return resultado;
    }

    private static string? BuscarDominioNaArvore(IntPtr hWnd)
    {
        var raiz = AutomationElement.FromHandle(hWnd);
        if (raiz is null)
            return null;

        // Requisição com cache para reduzir chamadas cross-process durante a varredura.
        var pedido = new CacheRequest();
        pedido.Add(AutomationElement.NameProperty);
        pedido.Add(AutomationElement.ControlTypeProperty);
        pedido.Add(ValuePattern.Pattern);
        pedido.TreeScope = TreeScope.Element;

        using (pedido.Activate())
        {
            var edits = raiz.FindAll(
                TreeScope.Descendants,
                new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Edit));

            AutomationElement? candidatoPorNome = null;
            AutomationElement? primeiroComUrl = null;

            foreach (AutomationElement edit in edits)
            {
                var valor = LerValor(edit);
                var dominio = HigienizadorTexto.ExtrairDominio(valor);
                if (dominio is null)
                    continue;

                var nome = (edit.Current.Name ?? string.Empty).ToLowerInvariant();
                if (PistasBarraEndereco.Any(p => nome.Contains(p, StringComparison.Ordinal)))
                {
                    candidatoPorNome = edit;
                    break;
                }

                primeiroComUrl ??= edit;
            }

            var alvo = candidatoPorNome ?? primeiroComUrl;
            return alvo is null ? null : HigienizadorTexto.ExtrairDominio(LerValor(alvo));
        }
    }

    private static string? LerValor(AutomationElement edit)
    {
        try
        {
            if (edit.TryGetCurrentPattern(ValuePattern.Pattern, out var patternObj)
                && patternObj is ValuePattern vp)
            {
                return vp.Current.Value;
            }
        }
        catch (ElementNotAvailableException)
        {
            // Elemento sumiu enquanto líamos (aba fechou). Segue sem valor.
        }

        return null;
    }
}
