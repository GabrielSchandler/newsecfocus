using System.Security.Cryptography;
using System.Text;
using System.Runtime.Versioning;

namespace Telemetria.Nucleo.Seguranca;

/// <summary>
/// Guarda a chave do SQLCipher e o token do dispositivo em disco, cifrados com DPAPI
/// no escopo LocalMachine. Só processos desta máquina conseguem decifrar, e como a
/// pasta tem ACL restrita a SYSTEM/Administradores, um usuário comum não lê o material.
///
/// A chave do banco é gerada uma vez (32 bytes aleatórios) e reaproveitada. O token do
/// dispositivo chega da Edge Function de matrícula e nunca mais sai da máquina em claro.
/// </summary>
[SupportedOSPlatform("windows")]
public static class CofreLocal
{
    // Entropia adicional fixa: some segurança sem depender só do escopo de máquina.
    private static readonly byte[] Entropia = Encoding.UTF8.GetBytes("TelemetriaProdutividade::v1");

    public static byte[] ObterOuCriarChaveBanco(string caminhoChave)
    {
        if (File.Exists(caminhoChave))
        {
            var cifrado = File.ReadAllBytes(caminhoChave);
            return ProtectedData.Unprotect(cifrado, Entropia, DataProtectionScope.LocalMachine);
        }

        var chave = RandomNumberGenerator.GetBytes(32);
        var protegido = ProtectedData.Protect(chave, Entropia, DataProtectionScope.LocalMachine);

        var temporario = caminhoChave + ".tmp";
        File.WriteAllBytes(temporario, protegido);
        File.Move(temporario, caminhoChave, overwrite: true);

        return chave;
    }

    public static void GravarToken(string caminhoToken, string token)
    {
        var protegido = ProtectedData.Protect(
            Encoding.UTF8.GetBytes(token), Entropia, DataProtectionScope.LocalMachine);

        var temporario = caminhoToken + ".tmp";
        File.WriteAllBytes(temporario, protegido);
        File.Move(temporario, caminhoToken, overwrite: true);
    }

    public static string? LerToken(string caminhoToken)
    {
        if (!File.Exists(caminhoToken))
            return null;

        try
        {
            var cifrado = File.ReadAllBytes(caminhoToken);
            var claro = ProtectedData.Unprotect(cifrado, Entropia, DataProtectionScope.LocalMachine);
            return Encoding.UTF8.GetString(claro);
        }
        catch (CryptographicException)
        {
            // Token gravado em outra máquina ou corrompido: força nova matrícula.
            return null;
        }
    }

    /// <summary>
    /// Converte a chave binária no literal que o PRAGMA key do SQLCipher espera.
    ///
    /// O literal de blob precisa vir ENTRE ASPAS DUPLAS: <c>PRAGMA key = "x'...'"</c>.
    /// A gramática de PRAGMA do SQLite não aceita blob literal solto — sem as aspas o
    /// banco responde <c>SQLite Error 1: near "x'...'": syntax error</c> e o agente
    /// morre na abertura do buffer, antes de conseguir registrar qualquer log.
    /// </summary>
    public static string ChaveParaPragma(byte[] chave) =>
        "\"x'" + Convert.ToHexString(chave).ToLowerInvariant() + "'\"";
}
