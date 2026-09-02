using System.Runtime.InteropServices;

namespace Telemetria.Coletor.Interop;

/// <summary>
/// Assinaturas P/Invoke do user32/kernel32 usadas pela coleta. Concentradas aqui
/// para o resto do coletor não lidar com marshalling. Usamos DllImport clássico:
/// as marshalling destas APIs (char[], structs com string) é madura e previsível.
/// </summary>
internal static class NativoUsuario
{
    internal const int WH_KEYBOARD_LL = 13;
    internal const int WH_MOUSE_LL = 14;

    internal const int WM_KEYDOWN = 0x0100;
    internal const int WM_SYSKEYDOWN = 0x0104;

    internal const int WM_LBUTTONDOWN = 0x0201;
    internal const int WM_RBUTTONDOWN = 0x0204;
    internal const int WM_MBUTTONDOWN = 0x0207;
    internal const int WM_XBUTTONDOWN = 0x020B;
    internal const int WM_MOUSEWHEEL = 0x020A;
    internal const int WM_MOUSEHWHEEL = 0x020E;

    internal const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

    internal delegate IntPtr ProcHook(int nCode, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    internal struct LASTINPUTINFO
    {
        public uint cbSize;
        public uint dwTime;
    }

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    internal static extern IntPtr SetWindowsHookEx(int idHook, ProcHook lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll")]
    internal static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    internal static extern IntPtr GetModuleHandle(string? lpModuleName);

    [DllImport("user32.dll")]
    internal static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", SetLastError = true)]
    internal static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    internal static extern int GetWindowText(IntPtr hWnd, [Out] char[] lpString, int nMaxCount);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    internal static extern int GetWindowTextLength(IntPtr hWnd);

    [DllImport("kernel32.dll", SetLastError = true)]
    internal static extern IntPtr OpenProcess(uint dwDesiredAccess, [MarshalAs(UnmanagedType.Bool)] bool bInheritHandle, uint dwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool CloseHandle(IntPtr hObject);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool QueryFullProcessImageName(IntPtr hProcess, uint dwFlags, [Out] char[] lpExeName, ref uint lpdwSize);

    /// <summary>Lê o título da janela em foco de forma segura, respeitando o tamanho real.</summary>
    internal static string ObterTituloJanela(IntPtr hWnd)
    {
        var tamanho = GetWindowTextLength(hWnd);
        if (tamanho <= 0)
            return string.Empty;

        var buffer = new char[tamanho + 1];
        var lidos = GetWindowText(hWnd, buffer, buffer.Length);
        return lidos > 0 ? new string(buffer, 0, lidos) : string.Empty;
    }

    /// <summary>Caminho completo do executável dono da janela; só o nome interessa depois.</summary>
    internal static string? ObterCaminhoExecutavel(uint processId)
    {
        var handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, processId);
        if (handle == IntPtr.Zero)
            return null;

        try
        {
            uint capacidade = 1024;
            var buffer = new char[capacidade];
            return QueryFullProcessImageName(handle, 0, buffer, ref capacidade)
                ? new string(buffer, 0, (int)capacidade)
                : null;
        }
        finally
        {
            CloseHandle(handle);
        }
    }
}
