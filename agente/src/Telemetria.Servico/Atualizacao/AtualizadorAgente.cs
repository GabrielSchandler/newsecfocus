using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using Telemetria.Nucleo.Configuracao;
using Telemetria.Nucleo.Utilitarios;

namespace Telemetria.Servico.Atualizacao;

/// <summary>
/// Traz a estação para a versão que o servidor anuncia, sem ninguém tocar na
/// máquina. É o que torna uma frota de trinta computadores administrável.
///
/// COMO A TROCA ACONTECE SEM TRAVAR ARQUIVO
///
/// As versões ficam lado a lado em Program Files\NewSec Focus\versoes\&lt;versão&gt;,
/// e o serviço aponta para uma delas. Trocar de versão é mudar para onde o
/// serviço aponta — nunca sobrescrever arquivo em uso. Isso importa porque
/// sobrescrever binário em execução é exatamente o que travou uma reinstalação
/// real em 03/09/2026, com o Windows segurando um DLL do coletor.
///
/// O QUE É BAIXADO
///
/// Só o que falta. O manifesto lista cada arquivo com seu sha256; arquivo cujo
/// hash já existe na versão em uso é copiado do disco, não da rede. Como o
/// runtime do .NET (223 dos 224 MB) não muda entre releases, a atualização
/// típica são 667 KB.
///
/// SE DER ERRADO
///
/// Quem para o serviço e troca é um script fora da pasta de instalação, porque
/// um atualizador que vive dentro do que ele substitui não sobrevive à
/// operação. Se a versão nova não subir, o script devolve o serviço para a
/// anterior e a versão fica marcada como recusada nesta máquina — sem isso,
/// uma versão ruim viraria laço infinito de baixar, quebrar e tentar de novo.
/// </summary>
public sealed class AtualizadorAgente
{
    private readonly HttpClient _http;
    private readonly ILogger<AtualizadorAgente> _log;
    private readonly string _versaoAtual;

    /// <summary>Uma tentativa por processo: se falhar, espera o serviço reiniciar.</summary>
    private bool _jaTentou;

    public AtualizadorAgente(HttpClient http, ILogger<AtualizadorAgente> log, string versaoAtual)
    {
        _http = http;
        _log = log;
        _versaoAtual = versaoAtual;
    }

    public async Task VerificarAsync(AlvoAtualizacao? alvo, CancellationToken token)
    {
        if (alvo?.Versao is null || alvo.Url is null || alvo.Sha256 is null)
            return;

        if (MesmaVersao(alvo.Versao, _versaoAtual))
            return;

        if (_jaTentou)
            return;

        if (FoiRecusada(alvo.Versao))
        {
            _log.LogDebug("Versão {v} já falhou nesta máquina; ignorando.", alvo.Versao);
            return;
        }

        _jaTentou = true;

        try
        {
            await AtualizarAsync(alvo, token);
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            // Falha de atualização nunca pode derrubar a coleta: o trabalho
            // principal do agente é registrar atividade, não se atualizar.
            _log.LogError(ex, "Atualização para {v} falhou. A coleta segue normal.", alvo.Versao);
        }
    }

    private async Task AtualizarAsync(AlvoAtualizacao alvo, CancellationToken token)
    {
        _log.LogInformation("Versão nova anunciada: {nova} (rodando {atual}).", alvo.Versao, _versaoAtual);

        // 1. Manifesto, conferido contra o hash que veio do banco.
        var textoManifesto = await _http.GetStringAsync(alvo.Url, token);
        var hashManifesto = HashDeTexto(textoManifesto);

        if (!hashManifesto.Equals(alvo.Sha256, StringComparison.OrdinalIgnoreCase))
        {
            _log.LogError(
                "Manifesto de {v} não confere com o hash anunciado. Abortando — pode ser arquivo corrompido ou adulterado.",
                alvo.Versao);
            Recusar(alvo.Versao!);
            return;
        }

        var manifesto = JsonSerializer.Deserialize<ManifestoVersao>(textoManifesto);
        if (manifesto?.Arquivos is null || manifesto.Arquivos.Length == 0)
        {
            _log.LogError("Manifesto de {v} veio vazio.", alvo.Versao);
            return;
        }

        // 2. Monta a nova versão ao lado da atual.
        var pastaVersoes = PastaVersoes();
        var destino = Path.Combine(pastaVersoes, alvo.Versao!);
        var origemLocal = AppContext.BaseDirectory;

        // Sobra de tentativa anterior interrompida: recomeça limpo.
        if (Directory.Exists(destino))
            Directory.Delete(destino, recursive: true);

        Directory.CreateDirectory(destino);

        var baixados = 0;
        var reaproveitados = 0;
        long bytesRede = 0;

        foreach (var arquivo in manifesto.Arquivos)
        {
            token.ThrowIfCancellationRequested();

            if (arquivo.Caminho is null || arquivo.Sha256 is null) continue;

            var caminhoFinal = Path.Combine(destino, arquivo.Caminho.Replace('/', Path.DirectorySeparatorChar));
            Directory.CreateDirectory(Path.GetDirectoryName(caminhoFinal)!);

            // Já temos esse conteúdo na versão em uso? Copia do disco.
            var candidato = Path.Combine(origemLocal, arquivo.Caminho.Replace('/', Path.DirectorySeparatorChar));
            if (File.Exists(candidato) && HashDeArquivo(candidato).Equals(arquivo.Sha256, StringComparison.OrdinalIgnoreCase))
            {
                File.Copy(candidato, caminhoFinal, overwrite: true);
                reaproveitados++;
                continue;
            }

            var bytes = await _http.GetByteArrayAsync($"{manifesto.BaseBlobs}{arquivo.Sha256}", token);
            var hash = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

            if (!hash.Equals(arquivo.Sha256, StringComparison.OrdinalIgnoreCase))
            {
                _log.LogError("Arquivo {a} baixado não confere com o hash do manifesto. Abortando.", arquivo.Caminho);
                Directory.Delete(destino, recursive: true);
                Recusar(alvo.Versao!);
                return;
            }

            await File.WriteAllBytesAsync(caminhoFinal, bytes, token);
            baixados++;
            bytesRede += bytes.Length;
        }

        _log.LogInformation(
            "Versão {v} montada: {b} arquivos baixados ({kb} KB), {r} reaproveitados do disco.",
            alvo.Versao, baixados, bytesRede / 1024, reaproveitados);

        // 3. O executável precisa existir, senão a troca deixaria o serviço morto.
        var exeNovo = Path.Combine(destino, "Telemetria.Servico.exe");
        if (!File.Exists(exeNovo))
        {
            _log.LogError("A versão {v} não traz Telemetria.Servico.exe. Abortando.", alvo.Versao);
            Directory.Delete(destino, recursive: true);
            Recusar(alvo.Versao!);
            return;
        }

        // 4. Dispara a troca e sai de cena: quem termina é o script, porque o
        //    serviço não consegue se parar e continuar rodando para se trocar.
        DispararTroca(exeNovo, alvo.Versao!);
    }

    private void DispararTroca(string exeNovo, string versaoNova)
    {
        var script = CaminhosAplicacao.ScriptTroca;
        if (!File.Exists(script))
        {
            _log.LogError("Script de troca não encontrado em {c}. A instalação precisa ser refeita.", script);
            return;
        }

        _log.LogInformation("Entregando a troca para {v} ao atualizador. O serviço vai reiniciar.", versaoNova);

        var inicio = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        foreach (var a in new[]
                 {
                     "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script,
                     "-ExeNovo", exeNovo,
                     "-VersaoNova", versaoNova,
                     "-ExeAtual", Path.Combine(AppContext.BaseDirectory, "Telemetria.Servico.exe"),
                 })
        {
            inicio.ArgumentList.Add(a);
        }

        Process.Start(inicio);
    }

    // ------------------------------------------------------------------------
    //  Apoio
    // ------------------------------------------------------------------------

    /// <summary>
    /// Onde as versões moram. Sobe um nível a partir da pasta em execução, que
    /// é ...\versoes\&lt;versão&gt;. Numa instalação antiga (formato plano) isso
    /// aponta para a própria pasta de instalação, e a montagem lado a lado
    /// simplesmente cria "versoes" ali dentro.
    /// </summary>
    private static string PastaVersoes()
    {
        var atual = new DirectoryInfo(AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar));
        return atual.Parent?.Name.Equals("versoes", StringComparison.OrdinalIgnoreCase) == true
            ? atual.Parent.FullName
            : Path.Combine(atual.FullName, "versoes");
    }

    /// <summary>"1.1.0" e "1.1.0.0" são a mesma coisa: o assembly carimba quatro campos.</summary>
    private static bool MesmaVersao(string a, string b)
    {
        static string Normalizar(string v)
        {
            var partes = v.Split('.').ToList();
            while (partes.Count < 4) partes.Add("0");
            return string.Join('.', partes.Take(4));
        }
        return Normalizar(a) == Normalizar(b);
    }

    private static string HashDeTexto(string texto) =>
        Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(texto))).ToLowerInvariant();

    private static string HashDeArquivo(string caminho)
    {
        using var fluxo = File.OpenRead(caminho);
        return Convert.ToHexString(SHA256.HashData(fluxo)).ToLowerInvariant();
    }

    private bool FoiRecusada(string versao)
    {
        try
        {
            return File.Exists(CaminhosAplicacao.VersoesRecusadas)
                && File.ReadLines(CaminhosAplicacao.VersoesRecusadas)
                       .Any(l => l.Trim().Equals(versao, StringComparison.OrdinalIgnoreCase));
        }
        catch
        {
            return false;
        }
    }

    private void Recusar(string versao)
    {
        try
        {
            Directory.CreateDirectory(CaminhosAplicacao.PastaAtualizacao);
            File.AppendAllText(CaminhosAplicacao.VersoesRecusadas, versao + Environment.NewLine);
            _log.LogWarning("Versão {v} marcada como recusada nesta máquina.", versao);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Não consegui registrar a recusa da versão {v}.", versao);
        }
    }
}

/// <summary>Manifesto publicado por agente/publicacao/publicar-versao.mjs.</summary>
public sealed class ManifestoVersao
{
    [JsonPropertyName("versao")]
    public string? Versao { get; set; }

    [JsonPropertyName("base_blobs")]
    public string? BaseBlobs { get; set; }

    [JsonPropertyName("arquivos")]
    public ArquivoManifesto[]? Arquivos { get; set; }
}

public sealed class ArquivoManifesto
{
    [JsonPropertyName("caminho")]
    public string? Caminho { get; set; }

    [JsonPropertyName("sha256")]
    public string? Sha256 { get; set; }

    [JsonPropertyName("tamanho")]
    public long Tamanho { get; set; }
}
