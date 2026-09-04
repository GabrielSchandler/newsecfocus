using System.Runtime.InteropServices;
using Telemetria.Coletor.Interop;

namespace Telemetria.Coletor.Monitoramento;

/// <summary>
/// Descobre se a sessão está com a tela bloqueada.
///
/// A primeira versão do coletor deduzia bloqueio pela ausência de janela em
/// primeiro plano. Nunca funcionou: no Windows moderno a tela de bloqueio TEM
/// janela (o LockApp), então o agente registrava zero minuto bloqueado e ainda
/// contabilizava <c>lockapp.exe</c> como se fosse um aplicativo em uso — o
/// almoço com a máquina travada entrava como tempo registrado e inflava a
/// aderência à jornada.
///
/// O teste correto é pelo desktop de entrada: quando a sessão trava, quem passa
/// a receber entrada é o desktop seguro do Winlogon, e um processo rodando como
/// o usuário não consegue abri-lo. <c>OpenInputDesktop</c> devolvendo nulo é,
/// portanto, o sinal de tela bloqueada.
///
/// O mesmo acontece durante o prompt de elevação do UAC, que também usa desktop
/// seguro. Isso não atrapalha: o minuto só é marcado como bloqueado quando
/// TODAS as subamostras dele acusam bloqueio, e um UAC dura segundos.
/// </summary>
public static class DetectorSessao
{
    /// <summary>Código de "acesso negado" — o erro que o desktop seguro devolve.</summary>
    private const int ERRO_ACESSO_NEGADO = 5;

    public static bool EstaBloqueada()
    {
        var desktop = NativoUsuario.OpenInputDesktop(0, false, NativoUsuario.DESKTOP_SWITCHDESKTOP);

        if (desktop != IntPtr.Zero)
        {
            NativoUsuario.CloseDesktop(desktop);
            return false;
        }

        // Falhou. Só tratamos como bloqueio quando o motivo é acesso negado, que
        // é o que o desktop seguro devolve. Qualquer outro erro (ambiente
        // incomum, política de segurança de terceiros) é tratado como NÃO
        // bloqueado de propósito: assumir bloqueio no escuro faria o agente
        // registrar zero trabalho o dia inteiro — falha pior do que a que esta
        // classe veio consertar. No máximo se volta a não detectar bloqueio.
        return Marshal.GetLastWin32Error() == ERRO_ACESSO_NEGADO;
    }
}
