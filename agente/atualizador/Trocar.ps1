#requires -Version 5.1
<#
============================================================================
 NewSec Focus — troca de versão do agente

 Roda como SYSTEM, disparado pelo próprio serviço quando ele já baixou e
 conferiu uma versão nova. Vive em ProgramData, FORA da pasta de instalação:
 um script que morasse dentro do que ele substitui não sobreviveria à
 operação.

 O que faz, em ordem:
   1. para o serviço e espera o processo morrer de verdade
   2. aponta o serviço para o executável da versão nova (sc config)
   3. sobe e confere se ficou de pé
   4. se não ficou, devolve para a versão anterior e registra a recusa
   5. apaga versões velhas, guardando a anterior para poder voltar

 Nunca sobrescreve arquivo: as versões ficam lado a lado e o que muda é para
 onde o serviço aponta.
============================================================================
#>

param(
    [Parameter(Mandatory = $true)] [string]$ExeNovo,
    [Parameter(Mandatory = $true)] [string]$VersaoNova,
    [Parameter(Mandatory = $true)] [string]$ExeAtual
)

$ErrorActionPreference = 'Stop'

$NomeServico = 'TelemetriaProdutividade'
$PastaDados  = Join-Path $env:ProgramData 'TelemetriaProdutividade'
$Log         = Join-Path $PastaDados 'atualizacao\troca.log'
$Recusadas   = Join-Path $PastaDados 'atualizacao\recusadas.txt'

function Registrar {
    param([string]$Texto)
    $linha = "{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Texto
    try { Add-Content -Path $Log -Value $linha -Encoding UTF8 } catch { }
}

function Parar-Servico {
    & sc.exe stop $NomeServico 2>&1 | Out-Null

    # Espera o processo sair da memória de verdade. Sem isto o sc config
    # seguinte pode pegar o serviço num estado intermediário.
    $limite = (Get-Date).AddSeconds(30)
    while ((Get-Process -Name 'Telemetria.Servico' -ErrorAction SilentlyContinue) -and (Get-Date) -lt $limite) {
        Start-Sleep -Milliseconds 300
    }
    Get-Process -Name 'Telemetria.Servico' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

    # O coletor roda na sessão do usuário, fora do controle do SCM: some junto,
    # senão continua rodando o binário da versão velha.
    Get-Process -Name 'Telemetria.Coletor' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

function Apontar-Para {
    param([string]$Exe)
    # O espaço depois de "binPath=" é exigência do sc.exe, não engano.
    $r = & sc.exe config $NomeServico binPath= "`"$Exe`""
    if ($LASTEXITCODE -ne 0) { throw "sc config falhou: $r" }
}

function Subiu-Em {
    param([int]$Segundos)
    & sc.exe start $NomeServico 2>&1 | Out-Null
    $limite = (Get-Date).AddSeconds($Segundos)
    while ((Get-Date) -lt $limite) {
        $s = Get-Service -Name $NomeServico -ErrorAction SilentlyContinue
        if ($s -and $s.Status -eq 'Running') {
            # Rodar não basta: um serviço que sobe e morre em 3 segundos
            # aparece como Running no instante certo. Confere se PERMANECE.
            Start-Sleep -Seconds 8
            $s.Refresh()
            if ($s.Status -eq 'Running') { return $true }
            return $false
        }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

try {
    New-Item -ItemType Directory -Path (Split-Path $Log) -Force | Out-Null
    Registrar "=== troca para $VersaoNova iniciada ==="
    Registrar "de:   $ExeAtual"
    Registrar "para: $ExeNovo"

    if (-not (Test-Path $ExeNovo)) { throw "executável novo não existe: $ExeNovo" }

    Parar-Servico
    Registrar "serviço parado"

    Apontar-Para $ExeNovo
    Registrar "serviço apontado para a versão nova"

    if (Subiu-Em 45) {
        Registrar "versão $VersaoNova no ar"

        # Guarda a anterior (dá para voltar) e limpa o que veio antes dela.
        try {
            $pastaVersoes = Split-Path (Split-Path $ExeNovo)
            $anterior = Split-Path $ExeAtual
            if (Test-Path $pastaVersoes) {
                Get-ChildItem $pastaVersoes -Directory |
                    Where-Object { $_.FullName -ne (Split-Path $ExeNovo) -and $_.FullName -ne $anterior } |
                    ForEach-Object {
                        Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
                        Registrar "versão antiga removida: $($_.Name)"
                    }
            }
        } catch {
            Registrar "aviso: limpeza de versões antigas falhou — $($_.Exception.Message)"
        }

        Registrar "=== troca concluída ==="
        exit 0
    }

    # Não subiu: volta para a anterior. É o ponto do qual tudo depende — uma
    # versão ruim não pode deixar a máquina sem coleta.
    Registrar "a versão $VersaoNova NÃO ficou de pé; revertendo"
    Parar-Servico
    Apontar-Para $ExeAtual

    if (Subiu-Em 45) {
        Registrar "revertido para a versão anterior, serviço no ar"
    } else {
        Registrar "ERRO GRAVE: nem a versão anterior subiu. Requer atendimento manual."
    }

    # Marca a recusa para o agente não tentar de novo em laço.
    try { Add-Content -Path $Recusadas -Value $VersaoNova -Encoding UTF8 } catch { }
    Registrar "=== troca revertida ==="
    exit 1
}
catch {
    Registrar "FALHA: $($_.Exception.Message)"

    # Qualquer exceção no meio do caminho: garante que a máquina volta a
    # coletar, mesmo que na versão velha.
    try {
        Apontar-Para $ExeAtual
        Subiu-Em 45 | Out-Null
        Registrar "serviço devolvido à versão anterior após falha"
    } catch {
        Registrar "ERRO GRAVE: não consegui devolver o serviço. Requer atendimento manual."
    }

    try { Add-Content -Path $Recusadas -Value $VersaoNova -Encoding UTF8 } catch { }
    exit 1
}
