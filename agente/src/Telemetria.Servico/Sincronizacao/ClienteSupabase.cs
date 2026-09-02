using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Telemetria.Nucleo.Configuracao;
using Telemetria.Nucleo.Modelos;

namespace Telemetria.Servico.Sincronizacao;

/// <summary>
/// Fala com as Edge Functions do Supabase. Duas rotas:
///   • registrar-dispositivo: troca a chave de matrícula por um token exclusivo da máquina;
///   • ingestao-lote: recebe o lote de registros pendentes.
///
/// Toda chamada leva a apikey (anon) para passar pelo gateway e o token do dispositivo
/// no Authorization; a RLS do banco garante que o token só enxerga a própria organização.
/// </summary>
public sealed class ClienteSupabase
{
    private readonly HttpClient _http;
    private readonly OpcoesAgente _opcoes;
    private readonly ILogger<ClienteSupabase> _log;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public ClienteSupabase(HttpClient http, OpcoesAgente opcoes, ILogger<ClienteSupabase> log)
    {
        _http = http;
        _opcoes = opcoes;
        _log = log;

        _http.BaseAddress = new Uri(opcoes.UrlSupabase.TrimEnd('/') + "/functions/v1/");
        _http.Timeout = TimeSpan.FromSeconds(60);
        _http.DefaultRequestHeaders.Add("apikey", opcoes.ChaveAnonima);
    }

    public async Task<RespostaMatricula?> MatricularAsync(PedidoMatricula pedido, CancellationToken token)
    {
        using var requisicao = new HttpRequestMessage(HttpMethod.Post, "registrar-dispositivo")
        {
            Content = JsonContent.Create(pedido, options: Json)
        };
        // Na matrícula, o "bearer" é a própria anon key; a autorização real é a chave de matrícula no corpo.
        requisicao.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _opcoes.ChaveAnonima);

        using var resposta = await _http.SendAsync(requisicao, token);
        if (!resposta.IsSuccessStatusCode)
        {
            var corpo = await resposta.Content.ReadAsStringAsync(token);
            _log.LogError("Matrícula recusada ({s}): {c}", (int)resposta.StatusCode, corpo);
            return null;
        }

        return await resposta.Content.ReadFromJsonAsync<RespostaMatricula>(Json, token);
    }

    /// <summary>
    /// Envia um lote. Retorna a resposta em caso de HTTP 200; null em falha recuperável
    /// (rede/5xx), quando os registros devem permanecer no buffer para a próxima tentativa.
    /// </summary>
    public async Task<RespostaIngestao?> EnviarLoteAsync(LoteTelemetria lote, string tokenDispositivo, CancellationToken token)
    {
        using var requisicao = new HttpRequestMessage(HttpMethod.Post, "ingestao-lote")
        {
            Content = JsonContent.Create(lote, options: Json)
        };
        requisicao.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenDispositivo);

        HttpResponseMessage resposta;
        try
        {
            resposta = await _http.SendAsync(requisicao, token);
        }
        catch (HttpRequestException ex)
        {
            _log.LogWarning(ex, "Falha de rede ao enviar lote. Mantendo no buffer.");
            return null;
        }
        catch (TaskCanceledException) when (!token.IsCancellationRequested)
        {
            _log.LogWarning("Timeout ao enviar lote. Mantendo no buffer.");
            return null;
        }

        using (resposta)
        {
            if (resposta.StatusCode == HttpStatusCode.Unauthorized)
            {
                _log.LogError("Token do dispositivo rejeitado (401). Nova matrícula será necessária.");
                throw new TokenInvalidoException();
            }

            if (!resposta.IsSuccessStatusCode)
            {
                var corpo = await resposta.Content.ReadAsStringAsync(token);
                _log.LogWarning("Ingestão respondeu {s}: {c}. Mantendo no buffer.", (int)resposta.StatusCode, corpo);
                return null;
            }

            return await resposta.Content.ReadFromJsonAsync<RespostaIngestao>(Json, token);
        }
    }
}

/// <summary>Sinaliza que o token do dispositivo perdeu validade e a matrícula deve refazer-se.</summary>
public sealed class TokenInvalidoException : Exception;
