using Telemetria.Coletor.Interop;

namespace Telemetria.Coletor.Monitoramento;

/// <summary>
/// Ociosidade a partir de GetLastInputInfo — tempo, em milissegundos, desde a última
/// entrada de mouse ou teclado na sessão. Rodando na sessão interativa (não na Sessão 0
/// do serviço), esse valor reflete o usuário real.
/// </summary>
public static class DetectorOcioso
{
    /// <summary>Segundos desde a última interação do usuário nesta sessão.</summary>
    public static double SegundosDesdeUltimaEntrada()
    {
        var info = new NativoUsuario.LASTINPUTINFO
        {
            cbSize = (uint)System.Runtime.InteropServices.Marshal.SizeOf<NativoUsuario.LASTINPUTINFO>()
        };

        if (!NativoUsuario.GetLastInputInfo(ref info))
            return 0;

        // dwTime usa o mesmo relógio de GetTickCount (uptime em ms), que dá a volta em ~49,7 dias.
        var agora = (uint)Environment.TickCount;
        var decorridoMs = unchecked(agora - info.dwTime);
        return decorridoMs / 1000.0;
    }

    public static bool EstaOcioso(int limiteSegundos) =>
        SegundosDesdeUltimaEntrada() >= limiteSegundos;
}
