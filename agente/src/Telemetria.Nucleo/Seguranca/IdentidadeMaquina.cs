using Microsoft.Win32;
using System.Runtime.Versioning;

namespace Telemetria.Nucleo.Seguranca;

/// <summary>
/// Impressão estável da máquina, usada como chave de deduplicação na matrícula.
/// Preferimos o MachineGuid do registro — persiste a reinstalações do agente e é
/// barato de ler. Se faltar, caímos para o nome da máquina.
/// </summary>
[SupportedOSPlatform("windows")]
public static class IdentidadeMaquina
{
    public static string ObterIdHardware()
    {
        try
        {
            using var chave = Registry.LocalMachine.OpenSubKey(
                @"SOFTWARE\Microsoft\Cryptography", writable: false);

            if (chave?.GetValue("MachineGuid") is string guid && !string.IsNullOrWhiteSpace(guid))
                return guid.Trim();
        }
        catch
        {
            // Sem acesso ao registro: usa o fallback abaixo.
        }

        return "nome:" + Environment.MachineName;
    }

    public static string NomeMaquina => Environment.MachineName;

    public static string UsuarioAtual =>
        string.IsNullOrWhiteSpace(Environment.UserDomainName)
            ? Environment.UserName
            : $"{Environment.UserDomainName}\\{Environment.UserName}";
}
