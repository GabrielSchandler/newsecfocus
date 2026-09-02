using System.Diagnostics;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Telemetria.Servico.Supervisao;

/// <summary>
/// Mantém exatamente um coletor vivo em cada sessão interativa ativa. Faz varredura
/// periódica: sessão nova sem coletor recebe um lançamento; coletor que morreu (logoff,
/// crash) é reposto no próximo ciclo. Poll simples é preferível a assinar
/// SERVICE_CONTROL_SESSIONCHANGE porque não exige um ServiceBase customizado e cobre
/// também o caso de o coletor cair sozinho.
/// </summary>
public sealed class SupervisorSessoes : BackgroundService
{
    private static readonly TimeSpan Intervalo = TimeSpan.FromSeconds(30);

    private readonly LancadorSessao _lancador;
    private readonly ILogger<SupervisorSessoes> _log;

    // sessionId -> PID do coletor que lançamos para ela.
    private readonly Dictionary<uint, int> _coletoresPorSessao = new();

    public SupervisorSessoes(LancadorSessao lancador, ILogger<SupervisorSessoes> log)
    {
        _lancador = lancador;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _log.LogInformation("Supervisor de sessões iniciado.");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                ReconciliarSessoes();
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Falha ao reconciliar sessões.");
            }

            try { await Task.Delay(Intervalo, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }

    private void ReconciliarSessoes()
    {
        var ativas = _lancador.SessoesAtivas().ToHashSet();

        // Esquece sessões que não estão mais ativas (usuário deslogou).
        foreach (var sessao in _coletoresPorSessao.Keys.Where(s => !ativas.Contains(s)).ToArray())
        {
            _log.LogInformation("Sessão {s} não está mais ativa; coletor descartado.", sessao);
            _coletoresPorSessao.Remove(sessao);
        }

        foreach (var sessao in ativas)
        {
            if (ColetorVivo(sessao))
                continue;

            var pid = _lancador.LancarNaSessao(sessao);
            if (pid is not null)
                _coletoresPorSessao[sessao] = pid.Value;
        }
    }

    private bool ColetorVivo(uint sessao)
    {
        if (!_coletoresPorSessao.TryGetValue(sessao, out var pid))
            return false;

        try
        {
            using var processo = Process.GetProcessById(pid);
            return !processo.HasExited;
        }
        catch (ArgumentException)
        {
            // Processo não existe mais.
            _coletoresPorSessao.Remove(sessao);
            return false;
        }
    }
}
