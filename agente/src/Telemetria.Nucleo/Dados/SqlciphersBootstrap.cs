namespace Telemetria.Nucleo.Dados;

/// <summary>
/// Registra o provedor nativo do SQLCipher em Microsoft.Data.Sqlite. Os pacotes
/// bundle_e_sqlcipher já trazem um module initializer que faz isso automaticamente
/// no .NET 8, mas deixamos a chamada explícita disponível para testes que criem o
/// buffer fora do host normal.
/// </summary>
public static class SqlcipherBootstrap
{
    private static bool _iniciado;
    private static readonly object Trava = new();

    public static void Garantir()
    {
        if (_iniciado)
            return;

        lock (Trava)
        {
            if (_iniciado)
                return;

            SQLitePCL.Batteries_V2.Init();
            _iniciado = true;
        }
    }
}
