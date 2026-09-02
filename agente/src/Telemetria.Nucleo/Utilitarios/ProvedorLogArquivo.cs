using System.Collections.Concurrent;
using System.Text;
using Microsoft.Extensions.Logging;

namespace Telemetria.Nucleo.Utilitarios;

/// <summary>
/// Logger de arquivo mínimo, sem dependências externas, com rotação por tamanho.
/// Suficiente para diagnóstico de campo do agente sem carregar Serilog/NLog num
/// processo que precisa ser leve.
/// </summary>
public sealed class ProvedorLogArquivo : ILoggerProvider
{
    private readonly string _caminho;
    private readonly long _tamanhoMaximoBytes;
    private readonly object _trava = new();
    private readonly ConcurrentDictionary<string, LoggerArquivo> _loggers = new();

    public ProvedorLogArquivo(string caminho, long tamanhoMaximoBytes = 5 * 1024 * 1024)
    {
        _caminho = caminho;
        _tamanhoMaximoBytes = tamanhoMaximoBytes;
        Directory.CreateDirectory(Path.GetDirectoryName(caminho)!);
    }

    public ILogger CreateLogger(string categoryName) =>
        _loggers.GetOrAdd(categoryName, nome => new LoggerArquivo(nome, Escrever));

    private void Escrever(string linha)
    {
        lock (_trava)
        {
            try
            {
                RotacionarSePreciso();
                File.AppendAllText(_caminho, linha + Environment.NewLine, Encoding.UTF8);
            }
            catch
            {
                // Log é diagnóstico; nunca derruba a coleta por falha de escrita.
            }
        }
    }

    private void RotacionarSePreciso()
    {
        var info = new FileInfo(_caminho);
        if (!info.Exists || info.Length < _tamanhoMaximoBytes)
            return;

        var antigo = _caminho + ".1";
        if (File.Exists(antigo))
            File.Delete(antigo);
        File.Move(_caminho, antigo);
    }

    public void Dispose() => _loggers.Clear();

    private sealed class LoggerArquivo(string categoria, Action<string> escrever) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => logLevel != LogLevel.None;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state,
            Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(logLevel))
                return;

            var nomeCurto = categoria.Contains('.') ? categoria[(categoria.LastIndexOf('.') + 1)..] : categoria;
            var texto = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} [{Nivel(logLevel)}] {nomeCurto}: {formatter(state, exception)}";
            if (exception is not null)
                texto += Environment.NewLine + exception;

            escrever(texto);
        }

        private static string Nivel(LogLevel nivel) => nivel switch
        {
            LogLevel.Trace => "TRC",
            LogLevel.Debug => "DBG",
            LogLevel.Information => "INF",
            LogLevel.Warning => "AVI",
            LogLevel.Error => "ERR",
            LogLevel.Critical => "CRT",
            _ => "___"
        };
    }
}
