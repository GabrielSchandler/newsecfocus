namespace Telemetria.Nucleo.Utilitarios;

/// <summary>
/// Caminhos fixos em ProgramData. O serviço roda como SYSTEM e o coletor roda como
/// o usuário logado, mas os dois precisam enxergar o MESMO arquivo SQLite — por isso
/// nada pode ficar em %APPDATA%.
///
/// A ACL restritiva da pasta (SYSTEM/Administradores = total, usuários = modificar,
/// herança desligada) é aplicada por icacls no install_service.bat, não aqui.
/// </summary>
public static class CaminhosAplicacao
{
    public static string Raiz { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "TelemetriaProdutividade");

    public static string BancoLocal => Path.Combine(Raiz, "telemetry.db");

    public static string ChaveBanco => Path.Combine(Raiz, "chave.bin");

    public static string TokenDispositivo => Path.Combine(Raiz, "dispositivo.bin");

    public static string ConfiguracaoSobreposta => Path.Combine(Raiz, "configuracao.json");

    public static string PastaLogs => Path.Combine(Raiz, "logs");

    /// <summary>Cria a árvore de pastas. Idempotente, pode ser chamada a cada boot.</summary>
    public static void GarantirEstrutura()
    {
        Directory.CreateDirectory(Raiz);
        Directory.CreateDirectory(PastaLogs);
    }
}
