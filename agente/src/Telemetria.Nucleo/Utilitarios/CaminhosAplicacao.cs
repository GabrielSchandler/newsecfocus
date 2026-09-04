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

    // ------------------------------------------------------------------------
    //  Atualização automática
    //
    //  Tudo que troca versão mora em ProgramData, FORA da pasta de instalação.
    //  O motivo é direto: a pasta de instalação é justamente o que está sendo
    //  substituído, e um atualizador que vive dentro do que ele troca não
    //  sobrevive à própria operação.
    // ------------------------------------------------------------------------

    /// <summary>Área de trabalho da atualização: script de troca, marcadores e log.</summary>
    public static string PastaAtualizacao => Path.Combine(Raiz, "atualizacao");

    /// <summary>Script que para o serviço, aponta para a versão nova e devolve no ar.</summary>
    public static string ScriptTroca => Path.Combine(PastaAtualizacao, "Trocar.ps1");

    /// <summary>
    /// Versões que já falharam ao subir nesta máquina. Sem isto, uma versão ruim
    /// viraria laço infinito: baixa, troca, quebra, volta, tenta de novo.
    /// </summary>
    public static string VersoesRecusadas => Path.Combine(PastaAtualizacao, "recusadas.txt");

    /// <summary>Cria a árvore de pastas. Idempotente, pode ser chamada a cada boot.</summary>
    public static void GarantirEstrutura()
    {
        Directory.CreateDirectory(Raiz);
        Directory.CreateDirectory(PastaLogs);
        Directory.CreateDirectory(PastaAtualizacao);
    }
}
