using System.Runtime.InteropServices;
using Microsoft.Extensions.Logging;
using Telemetria.Servico.Interop;

namespace Telemetria.Servico.Supervisao;

/// <summary>
/// Lança o coletor dentro da sessão interativa de um usuário, a partir do serviço
/// SYSTEM. Sem isso, nenhum hook de entrada nem GetForegroundWindow funcionaria: o
/// serviço vive na Sessão 0, isolada da área de trabalho do usuário desde o Windows Vista.
/// </summary>
public sealed class LancadorSessao
{
    private readonly ILogger<LancadorSessao> _log;
    private readonly string _caminhoColetor;

    public LancadorSessao(string caminhoColetor, ILogger<LancadorSessao> log)
    {
        _caminhoColetor = caminhoColetor;
        _log = log;
    }

    /// <summary>Sessões interativas em estado ativo (usuário logado e à frente).</summary>
    public IReadOnlyList<uint> SessoesAtivas()
    {
        var sessoes = new List<uint>();

        if (!NativoSessao.WTSEnumerateSessions(IntPtr.Zero, 0, 1, out var ponteiro, out var total))
        {
            _log.LogWarning("WTSEnumerateSessions falhou. Win32 = {e}.", Marshal.GetLastWin32Error());
            return sessoes;
        }

        try
        {
            var tamanho = Marshal.SizeOf<NativoSessao.WTS_SESSION_INFO>();
            var atual = ponteiro;

            for (var i = 0; i < total; i++)
            {
                var info = Marshal.PtrToStructure<NativoSessao.WTS_SESSION_INFO>(atual);
                atual = IntPtr.Add(atual, tamanho);

                // Sessão 0 é a do serviço; nunca tem usuário interativo.
                if (info.SessionId == 0)
                    continue;

                if (info.State == NativoSessao.WTS_CONNECTSTATE_CLASS.WTSActive)
                    sessoes.Add(info.SessionId);
            }
        }
        finally
        {
            NativoSessao.WTSFreeMemory(ponteiro);
        }

        return sessoes;
    }

    /// <summary>
    /// Cria uma instância do coletor rodando como o usuário da sessão informada.
    /// Retorna o PID criado, ou null em caso de falha (ex.: sessão de tela de login,
    /// que ainda não tem token de usuário).
    /// </summary>
    public int? LancarNaSessao(uint sessionId)
    {
        if (!NativoSessao.WTSQueryUserToken(sessionId, out var tokenUsuario))
        {
            // Comum em telas de logon/UAC: ainda não há usuário. Não é erro fatal.
            _log.LogDebug("Sem token de usuário para a sessão {s} (Win32 {e}).",
                sessionId, Marshal.GetLastWin32Error());
            return null;
        }

        var tokenPrimario = IntPtr.Zero;
        var blocoAmbiente = IntPtr.Zero;

        try
        {
            if (!NativoSessao.DuplicateTokenEx(
                    tokenUsuario, NativoSessao.MAXIMUM_ALLOWED, IntPtr.Zero,
                    NativoSessao.SECURITY_IMPERSONATION_LEVEL.Impersonation,
                    NativoSessao.TOKEN_TYPE.TokenPrimary, out tokenPrimario))
            {
                _log.LogWarning("DuplicateTokenEx falhou (sessão {s}, Win32 {e}).",
                    sessionId, Marshal.GetLastWin32Error());
                return null;
            }

            NativoSessao.CreateEnvironmentBlock(out blocoAmbiente, tokenPrimario, false);

            var startup = new NativoSessao.STARTUPINFO
            {
                cb = Marshal.SizeOf<NativoSessao.STARTUPINFO>(),
                // Área de trabalho interativa padrão; sem isso a janela/tray não aparece.
                lpDesktop = @"winsta0\default"
            };

            var flags = NativoSessao.CREATE_UNICODE_ENVIRONMENT | NativoSessao.NORMAL_PRIORITY_CLASS;
            var linhaComando = "\"" + _caminhoColetor + "\"";

            if (!NativoSessao.CreateProcessAsUser(
                    tokenPrimario, _caminhoColetor, linhaComando,
                    IntPtr.Zero, IntPtr.Zero, false, flags,
                    blocoAmbiente, Path.GetDirectoryName(_caminhoColetor),
                    ref startup, out var infoProcesso))
            {
                _log.LogWarning("CreateProcessAsUser falhou (sessão {s}, Win32 {e}).",
                    sessionId, Marshal.GetLastWin32Error());
                return null;
            }

            NativoSessao.CloseHandle(infoProcesso.hProcess);
            NativoSessao.CloseHandle(infoProcesso.hThread);

            _log.LogInformation("Coletor lançado na sessão {s}, PID {p}.", sessionId, infoProcesso.dwProcessId);
            return infoProcesso.dwProcessId;
        }
        finally
        {
            if (blocoAmbiente != IntPtr.Zero)
                NativoSessao.DestroyEnvironmentBlock(blocoAmbiente);
            if (tokenPrimario != IntPtr.Zero)
                NativoSessao.CloseHandle(tokenPrimario);
            NativoSessao.CloseHandle(tokenUsuario);
        }
    }
}
