using System.Reflection;
using Microsoft.Extensions.Logging;
using Telemetria.Nucleo.Configuracao;
using Telemetria.Nucleo.Modelos;
using Telemetria.Nucleo.Seguranca;
using Telemetria.Nucleo.Utilitarios;

namespace Telemetria.Servico.Sincronizacao;

/// <summary>
/// Garante que a máquina tenha um token de dispositivo válido antes de sincronizar.
/// A chave de matrícula (compartilhada pela organização) é trocada, uma única vez,
/// por um token exclusivo desta máquina, guardado cifrado com DPAPI. Se o token cair
/// (401), refaz a matrícula automaticamente.
/// </summary>
public sealed class GerenciadorMatricula
{
    private readonly ClienteSupabase _cliente;
    private readonly OpcoesAgente _opcoes;
    private readonly ILogger<GerenciadorMatricula> _log;
    private string? _tokenMemoria;

    public GerenciadorMatricula(ClienteSupabase cliente, OpcoesAgente opcoes, ILogger<GerenciadorMatricula> log)
    {
        _cliente = cliente;
        _opcoes = opcoes;
        _log = log;
    }

    public async Task<string?> ObterTokenAsync(CancellationToken token)
    {
        if (!string.IsNullOrEmpty(_tokenMemoria))
            return _tokenMemoria;

        var salvo = CofreLocal.LerToken(CaminhosAplicacao.TokenDispositivo);
        if (!string.IsNullOrEmpty(salvo))
        {
            _tokenMemoria = salvo;
            return salvo;
        }

        return await MatricularAsync(token);
    }

    public async Task<string?> MatricularAsync(CancellationToken token)
    {
        if (string.IsNullOrWhiteSpace(_opcoes.ChaveMatricula))
        {
            _log.LogError("Sem chave de matrícula configurada. Não é possível registrar a máquina.");
            return null;
        }

        var pedido = new PedidoMatricula
        {
            ChaveMatricula = _opcoes.ChaveMatricula,
            NomeMaquina = IdentidadeMaquina.NomeMaquina,
            UsuarioSo = IdentidadeMaquina.UsuarioAtual,
            IdHardware = IdentidadeMaquina.ObterIdHardware(),
            VersaoAgente = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "1.0.0"
        };

        var resposta = await _cliente.MatricularAsync(pedido, token);
        if (resposta is null || string.IsNullOrEmpty(resposta.TokenDispositivo))
        {
            _log.LogError("Matrícula não retornou token válido.");
            return null;
        }

        CofreLocal.GravarToken(CaminhosAplicacao.TokenDispositivo, resposta.TokenDispositivo);
        _tokenMemoria = resposta.TokenDispositivo;
        _log.LogInformation("Máquina matriculada. Dispositivo {id}.", resposta.IdDispositivo);
        return resposta.TokenDispositivo;
    }

    public void InvalidarToken()
    {
        _tokenMemoria = null;
        try
        {
            if (File.Exists(CaminhosAplicacao.TokenDispositivo))
                File.Delete(CaminhosAplicacao.TokenDispositivo);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Não foi possível apagar o token inválido.");
        }
    }
}
