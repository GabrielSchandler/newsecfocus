using Microsoft.Extensions.Logging;
using Telemetria.Coletor.Interop;

namespace Telemetria.Coletor.Monitoramento;

/// <summary>
/// Lê o estado da janela em primeiro plano: executável e título. A extração de
/// domínio de navegador fica no <see cref="ExtratorDominio"/> para isolar o custo
/// da UI Automation.
/// </summary>
public sealed class InspetorJanela
{
    private readonly ILogger<InspetorJanela> _log;

    public InspetorJanela(ILogger<InspetorJanela> log) => _log = log;

    public JanelaAtiva? CapturarPrimeiroPlano()
    {
        var hWnd = NativoUsuario.GetForegroundWindow();
        if (hWnd == IntPtr.Zero)
            return null; // Sessão bloqueada, tela segura ou nenhuma janela ativa.

        NativoUsuario.GetWindowThreadProcessId(hWnd, out var pid);
        if (pid == 0)
            return null;

        var caminho = NativoUsuario.ObterCaminhoExecutavel(pid);
        var nomeProcesso = string.IsNullOrEmpty(caminho)
            ? "desconhecido.exe"
            : Path.GetFileName(caminho).ToLowerInvariant();

        var titulo = NativoUsuario.ObterTituloJanela(hWnd);

        return new JanelaAtiva(hWnd, pid, nomeProcesso, titulo);
    }
}

/// <summary>Snapshot da janela em foco em um instante.</summary>
public readonly record struct JanelaAtiva(IntPtr Handle, uint ProcessId, string NomeProcesso, string Titulo);
