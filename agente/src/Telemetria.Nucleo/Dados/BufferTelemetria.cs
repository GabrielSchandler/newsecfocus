using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;
using Telemetria.Nucleo.Modelos;
using Telemetria.Nucleo.Seguranca;

namespace Telemetria.Nucleo.Dados;

/// <summary>
/// Buffer local cifrado (SQLCipher). É a fila offline-first do agente: o coletor
/// grava um registro por minuto, o serviço lê lotes, envia e apaga o que foi aceito.
///
/// Dois processos diferentes tocam o mesmo arquivo (coletor = usuário, serviço =
/// SYSTEM), então o WAL fica ligado e as escritas são pequenas e serializadas por
/// conexão. Cada operação abre e fecha a própria conexão para não segurar lock.
/// </summary>
public sealed class BufferTelemetria
{
    private readonly string _stringConexao;
    private readonly string _pragmaChave;
    private readonly ILogger<BufferTelemetria> _log;

    public BufferTelemetria(string caminhoBanco, byte[] chave, ILogger<BufferTelemetria> log)
    {
        _log = log;
        _pragmaChave = CofreLocal.ChaveParaPragma(chave);
        // Cache privado: o coletor (usuário) e o serviço (SYSTEM) são processos
        // distintos, então o isolamento entre eles se dá por lock de arquivo + WAL,
        // não por cache compartilhado (que é só intra-processo). Pooling desligado
        // para cada operação fechar o handle e não segurar lock entre chamadas.
        _stringConexao = new SqliteConnectionStringBuilder
        {
            DataSource = caminhoBanco,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Default,
            Pooling = false
        }.ToString();
    }

    private SqliteConnection Abrir()
    {
        var conexao = new SqliteConnection(_stringConexao);
        conexao.Open();

        using (var pragma = conexao.CreateCommand())
        {
            // A chave precisa ser o PRIMEIRO comando após abrir, antes de qualquer leitura.
            pragma.CommandText = $"PRAGMA key = {_pragmaChave};";
            pragma.ExecuteNonQuery();

            pragma.CommandText =
                "PRAGMA journal_mode = WAL;" +
                "PRAGMA synchronous = NORMAL;" +
                "PRAGMA busy_timeout = 5000;" +
                "PRAGMA foreign_keys = ON;";
            pragma.ExecuteNonQuery();
        }

        return conexao;
    }

    /// <summary>Cria o schema local se ainda não existir. Chamar uma vez no boot.</summary>
    public void Inicializar()
    {
        using var conexao = Abrir();
        using var cmd = conexao.CreateCommand();
        cmd.CommandText =
            """
            CREATE TABLE IF NOT EXISTS pending_logs (
                id                 INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp_utc      TEXT    NOT NULL,
                process_name       TEXT    NOT NULL,
                window_title       TEXT    NOT NULL DEFAULT '',
                domain             TEXT,
                is_idle            INTEGER NOT NULL DEFAULT 0,
                is_locked          INTEGER NOT NULL DEFAULT 0,
                keystrokes_count   INTEGER NOT NULL DEFAULT 0,
                mouse_clicks_count INTEGER NOT NULL DEFAULT 0,
                scroll_count       INTEGER NOT NULL DEFAULT 0,
                active_seconds     INTEGER NOT NULL DEFAULT 0,
                foreground_seconds INTEGER NOT NULL DEFAULT 0,
                os_user            TEXT    NOT NULL DEFAULT '',
                criado_em          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
            );

            CREATE INDEX IF NOT EXISTS idx_pending_timestamp ON pending_logs(timestamp_utc);

            CREATE TABLE IF NOT EXISTS estado_agente (
                chave TEXT PRIMARY KEY,
                valor TEXT
            );

            -- Diario de bordo da estacao: quando o agente subiu/parou e quando a
            -- maquina dormiu/acordou. Fica em tabela separada de pending_logs
            -- porque NAO e medicao de tempo — se entrasse la, um "suspensa"
            -- viraria um minuto de atividade e sujaria a produtividade.
            --
            -- Guardado localmente porque o evento mais importante (suspensao)
            -- acontece justamente quando nao da para enviar nada: a maquina esta
            -- congelando. Sobe junto do proximo lote, com o instante original.
            CREATE TABLE IF NOT EXISTS pending_eventos (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo        TEXT NOT NULL,
                momento_utc TEXT NOT NULL,
                versao      TEXT,
                detalhe     TEXT,
                UNIQUE(tipo, momento_utc)
            );
            """;
        cmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Registra um marco do ciclo de vida da estacao. Silencioso e tolerante:
    /// perder um evento de diario nunca pode atrapalhar a coleta, que e o
    /// trabalho de verdade do agente. O UNIQUE evita duplicar quando o mesmo
    /// evento e registrado duas vezes (ex.: encerramento + desligamento).
    /// </summary>
    public void InserirEvento(string tipo, DateTimeOffset momento, string? versao = null, string? detalhe = null)
    {
        try
        {
            using var conexao = Abrir();
            using var cmd = conexao.CreateCommand();
            cmd.CommandText =
                """
                INSERT OR IGNORE INTO pending_eventos (tipo, momento_utc, versao, detalhe)
                VALUES ($tipo, $momento, $versao, $detalhe);
                """;
            cmd.Parameters.AddWithValue("$tipo", tipo);
            cmd.Parameters.AddWithValue("$momento", momento.UtcDateTime.ToString("o"));
            cmd.Parameters.AddWithValue("$versao", (object?)versao ?? DBNull.Value);
            cmd.Parameters.AddWithValue("$detalhe", (object?)detalhe ?? DBNull.Value);
            cmd.ExecuteNonQuery();
        }
        catch (Exception ex)
        {
            _log.LogDebug(ex, "Nao consegui registrar o evento {t}.", tipo);
        }
    }

    /// <summary>Eventos aguardando envio, mais antigos primeiro.</summary>
    public List<EventoEstacao> LerEventos(int limite = 200)
    {
        var saida = new List<EventoEstacao>();
        try
        {
            using var conexao = Abrir();
            using var cmd = conexao.CreateCommand();
            cmd.CommandText =
                "SELECT id, tipo, momento_utc, versao, detalhe FROM pending_eventos ORDER BY id LIMIT $limite;";
            cmd.Parameters.AddWithValue("$limite", limite);

            using var leitor = cmd.ExecuteReader();
            while (leitor.Read())
            {
                saida.Add(new EventoEstacao
                {
                    IdLocal = leitor.GetInt64(0),
                    Tipo = leitor.GetString(1),
                    Momento = DateTimeOffset.Parse(leitor.GetString(2)),
                    Versao = leitor.IsDBNull(3) ? null : leitor.GetString(3),
                    Detalhe = leitor.IsDBNull(4) ? null : leitor.GetString(4),
                });
            }
        }
        catch (Exception ex)
        {
            _log.LogDebug(ex, "Nao consegui ler os eventos pendentes.");
        }
        return saida;
    }

    /// <summary>Apaga os eventos ja confirmados pelo servidor.</summary>
    public void ApagarEventos(IEnumerable<long> ids)
    {
        var lista = ids.ToList();
        if (lista.Count == 0) return;

        try
        {
            using var conexao = Abrir();
            using var cmd = conexao.CreateCommand();
            cmd.CommandText =
                $"DELETE FROM pending_eventos WHERE id IN ({string.Join(',', lista)});";
            cmd.ExecuteNonQuery();
        }
        catch (Exception ex)
        {
            _log.LogDebug(ex, "Nao consegui limpar os eventos enviados.");
        }
    }

    public void Inserir(RegistroAtividade registro)
    {
        using var conexao = Abrir();
        using var cmd = conexao.CreateCommand();
        cmd.CommandText =
            """
            INSERT INTO pending_logs
                (timestamp_utc, process_name, window_title, domain, is_idle, is_locked,
                 keystrokes_count, mouse_clicks_count, scroll_count,
                 active_seconds, foreground_seconds, os_user)
            VALUES
                ($ts, $proc, $titulo, $dominio, $idle, $locked,
                 $teclas, $cliques, $scroll, $ativos, $foco, $usuario);
            """;

        cmd.Parameters.AddWithValue("$ts", registro.Instante.UtcDateTime.ToString("o"));
        cmd.Parameters.AddWithValue("$proc", registro.NomeProcesso);
        cmd.Parameters.AddWithValue("$titulo", registro.TituloJanela ?? string.Empty);
        cmd.Parameters.AddWithValue("$dominio", (object?)registro.Dominio ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$idle", registro.Ocioso ? 1 : 0);
        cmd.Parameters.AddWithValue("$locked", registro.Bloqueado ? 1 : 0);
        cmd.Parameters.AddWithValue("$teclas", registro.Teclas);
        cmd.Parameters.AddWithValue("$cliques", registro.Cliques);
        cmd.Parameters.AddWithValue("$scroll", registro.Rolagens);
        cmd.Parameters.AddWithValue("$ativos", registro.SegundosAtivos);
        cmd.Parameters.AddWithValue("$foco", registro.SegundosEmFoco);
        cmd.Parameters.AddWithValue("$usuario", registro.UsuarioSo);

        cmd.ExecuteNonQuery();
    }

    /// <summary>Lê até <paramref name="limite"/> registros mais antigos para envio.</summary>
    public IReadOnlyList<RegistroAtividade> LerLote(int limite)
    {
        using var conexao = Abrir();
        using var cmd = conexao.CreateCommand();
        cmd.CommandText =
            """
            SELECT id, timestamp_utc, process_name, window_title, domain, is_idle, is_locked,
                   keystrokes_count, mouse_clicks_count, scroll_count,
                   active_seconds, foreground_seconds, os_user
            FROM pending_logs
            ORDER BY id ASC
            LIMIT $limite;
            """;
        cmd.Parameters.AddWithValue("$limite", limite);

        var lista = new List<RegistroAtividade>(limite);
        using var leitor = cmd.ExecuteReader();
        while (leitor.Read())
        {
            lista.Add(new RegistroAtividade
            {
                IdLocal = leitor.GetInt64(0),
                Instante = DateTimeOffset.Parse(leitor.GetString(1), null,
                    System.Globalization.DateTimeStyles.AssumeUniversal | System.Globalization.DateTimeStyles.AdjustToUniversal),
                NomeProcesso = leitor.GetString(2),
                TituloJanela = leitor.GetString(3),
                Dominio = leitor.IsDBNull(4) ? null : leitor.GetString(4),
                Ocioso = leitor.GetInt32(5) == 1,
                Bloqueado = leitor.GetInt32(6) == 1,
                Teclas = leitor.GetInt32(7),
                Cliques = leitor.GetInt32(8),
                Rolagens = leitor.GetInt32(9),
                SegundosAtivos = leitor.GetInt32(10),
                SegundosEmFoco = leitor.GetInt32(11),
                UsuarioSo = leitor.GetString(12)
            });
        }

        return lista;
    }

    /// <summary>Remove do buffer os registros já confirmados pelo servidor (HTTP 200).</summary>
    public int ApagarPorId(IEnumerable<long> ids)
    {
        var lista = ids.ToArray();
        if (lista.Length == 0)
            return 0;

        using var conexao = Abrir();
        using var transacao = conexao.BeginTransaction();
        using var cmd = conexao.CreateCommand();
        cmd.Transaction = transacao;
        cmd.CommandText = "DELETE FROM pending_logs WHERE id = $id;";
        var parametro = cmd.CreateParameter();
        parametro.ParameterName = "$id";
        cmd.Parameters.Add(parametro);

        var removidos = 0;
        foreach (var id in lista)
        {
            parametro.Value = id;
            removidos += cmd.ExecuteNonQuery();
        }

        transacao.Commit();
        return removidos;
    }

    /// <summary>Descarta registros mais velhos que o limite de retenção (rede caiu por semanas).</summary>
    public int PurgarAntigos(int diasRetencao)
    {
        using var conexao = Abrir();
        using var cmd = conexao.CreateCommand();
        cmd.CommandText =
            "DELETE FROM pending_logs WHERE timestamp_utc < $limite;";
        cmd.Parameters.AddWithValue("$limite",
            DateTime.UtcNow.AddDays(-diasRetencao).ToString("o"));

        var removidos = cmd.ExecuteNonQuery();
        if (removidos > 0)
            _log.LogWarning("Buffer: {n} registros descartados por retencao ({d} dias).", removidos, diasRetencao);
        return removidos;
    }

    public long ContarPendentes()
    {
        using var conexao = Abrir();
        using var cmd = conexao.CreateCommand();
        cmd.CommandText = "SELECT COUNT(*) FROM pending_logs;";
        return (long)(cmd.ExecuteScalar() ?? 0L);
    }

    public void CompactarSePreciso()
    {
        using var conexao = Abrir();
        using var cmd = conexao.CreateCommand();
        cmd.CommandText = "PRAGMA wal_checkpoint(TRUNCATE); VACUUM;";
        cmd.ExecuteNonQuery();
    }
}
