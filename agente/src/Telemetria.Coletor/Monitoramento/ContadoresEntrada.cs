using System.Runtime.InteropServices;
using Microsoft.Extensions.Logging;
using Telemetria.Coletor.Interop;

namespace Telemetria.Coletor.Monitoramento;

/// <summary>
/// Hooks globais de baixo nível (WH_KEYBOARD_LL / WH_MOUSE_LL). Contabilizam APENAS
/// a quantidade de eventos — tecla pressionada, clique, rolagem. Nenhum código de
/// tecla, caractere ou posição é lido ou guardado; o lParam dos eventos é ignorado
/// por completo, só o wParam (o tipo de evento) importa.
///
/// Precisa rodar numa thread com bomba de mensagens (a thread de UI do coletor).
/// Os callbacks devem retornar rápido, senão o Windows remove o hook por timeout.
/// </summary>
public sealed class ContadoresEntrada : IDisposable
{
    private readonly ILogger<ContadoresEntrada> _log;

    // Delegates mantidos em campo para não serem coletados pelo GC enquanto o hook vive.
    private readonly NativoUsuario.ProcHook _procTeclado;
    private readonly NativoUsuario.ProcHook _procMouse;

    private IntPtr _hookTeclado = IntPtr.Zero;
    private IntPtr _hookMouse = IntPtr.Zero;

    private long _teclas;
    private long _cliques;
    private long _rolagens;
    private long _ultimoEventoTicks; // DateTime.UtcNow.Ticks do último input observado

    public ContadoresEntrada(ILogger<ContadoresEntrada> log)
    {
        _log = log;
        _procTeclado = TratarTeclado;
        _procMouse = TratarMouse;
    }

    /// <summary>Instala os hooks. Deve ser chamado a partir da thread que roda o message loop.</summary>
    public void Instalar()
    {
        var modulo = NativoUsuario.GetModuleHandle(null);

        _hookTeclado = NativoUsuario.SetWindowsHookEx(NativoUsuario.WH_KEYBOARD_LL, _procTeclado, modulo, 0);
        _hookMouse = NativoUsuario.SetWindowsHookEx(NativoUsuario.WH_MOUSE_LL, _procMouse, modulo, 0);

        if (_hookTeclado == IntPtr.Zero || _hookMouse == IntPtr.Zero)
        {
            var erro = Marshal.GetLastWin32Error();
            _log.LogError("Falha ao instalar hooks de entrada. Win32 = {erro}.", erro);
        }
        else
        {
            _log.LogInformation("Hooks de teclado e mouse instalados.");
        }
    }

    private IntPtr TratarTeclado(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0)
        {
            var msg = (int)wParam;
            if (msg is NativoUsuario.WM_KEYDOWN or NativoUsuario.WM_SYSKEYDOWN)
            {
                Interlocked.Increment(ref _teclas);
                MarcarEvento();
            }
            // lParam contém o código da tecla — deliberadamente NÃO lido.
        }

        return NativoUsuario.CallNextHookEx(_hookTeclado, nCode, wParam, lParam);
    }

    private IntPtr TratarMouse(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0)
        {
            switch ((int)wParam)
            {
                case NativoUsuario.WM_LBUTTONDOWN:
                case NativoUsuario.WM_RBUTTONDOWN:
                case NativoUsuario.WM_MBUTTONDOWN:
                case NativoUsuario.WM_XBUTTONDOWN:
                    Interlocked.Increment(ref _cliques);
                    MarcarEvento();
                    break;

                case NativoUsuario.WM_MOUSEWHEEL:
                case NativoUsuario.WM_MOUSEHWHEEL:
                    Interlocked.Increment(ref _rolagens);
                    MarcarEvento();
                    break;
            }
        }

        return NativoUsuario.CallNextHookEx(_hookMouse, nCode, wParam, lParam);
    }

    private void MarcarEvento() =>
        Interlocked.Exchange(ref _ultimoEventoTicks, DateTime.UtcNow.Ticks);

    /// <summary>
    /// Lê os contadores acumulados e os zera atomicamente. Chamado uma vez por minuto
    /// pelo amostrador.
    /// </summary>
    public LeituraEntrada DrenarContadores()
    {
        var teclas = Interlocked.Exchange(ref _teclas, 0);
        var cliques = Interlocked.Exchange(ref _cliques, 0);
        var rolagens = Interlocked.Exchange(ref _rolagens, 0);

        return new LeituraEntrada(
            (int)Math.Min(teclas, int.MaxValue),
            (int)Math.Min(cliques, int.MaxValue),
            (int)Math.Min(rolagens, int.MaxValue));
    }

    public void Dispose()
    {
        if (_hookTeclado != IntPtr.Zero)
        {
            NativoUsuario.UnhookWindowsHookEx(_hookTeclado);
            _hookTeclado = IntPtr.Zero;
        }

        if (_hookMouse != IntPtr.Zero)
        {
            NativoUsuario.UnhookWindowsHookEx(_hookMouse);
            _hookMouse = IntPtr.Zero;
        }
    }
}

/// <summary>Contadores drenados de um intervalo de amostragem.</summary>
public readonly record struct LeituraEntrada(int Teclas, int Cliques, int Rolagens)
{
    public int Total => Teclas + Cliques + Rolagens;
}
