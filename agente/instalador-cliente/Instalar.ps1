#requires -Version 5.1
<#
============================================================================
 NewSec Focus — Instalador guiado (sem MSI assinado)

 Substitui o MSI enquanto nao houver certificado de assinatura de codigo.
 Pede so o codigo de instalacao (12 digitos, gerado no painel em
 Administracao > Empresa) e faz tudo: copia os binarios, grava a
 identidade da empresa no registro, cria o servico Windows e inicia.

 A URL e a chave publica do Supabase sao IGUAIS para toda a base de
 clientes (a chave anonima e feita para ser publica — o RLS do banco e
 quem protege os dados, nao o sigilo dela) e ficam fixas abaixo. So o
 codigo muda por empresa.
============================================================================
#>

# ----------------------------------------------------------------------------
#  Configuracao fixa do produto (igual para todos os clientes)
# ----------------------------------------------------------------------------
$UrlSupabase   = 'https://auwotdrgxjrrhhhmmekc.supabase.co'
$ChaveAnonima  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1d290ZHJneGpycmhoaG1tZWtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNzQ5NzcsImV4cCI6MjEwMzk1MDk3N30.ZR0KaGGbV7yzFFcya6o95-7WntpkLLd4Vtk8zqAyM2E'

$NomeServico     = 'TelemetriaProdutividade'   # id interno do servico Windows (nao muda: e o que os scripts existentes esperam)
$NomeExibicao    = 'NewSec Focus'
$PastaInstalacao = Join-Path $env:ProgramFiles 'NewSec Focus'
$PastaDados      = Join-Path $env:ProgramData 'TelemetriaProdutividade'   # caminho fixo, compilado no agente — nao mudar
$ChaveRegistro   = 'HKLM:\SOFTWARE\NewSecFocus'

$ErrorActionPreference = 'Stop'

# ----------------------------------------------------------------------------
#  Aparencia
# ----------------------------------------------------------------------------
$CorTitulo  = 'Cyan'
$CorTexto   = 'Gray'
$CorSucesso = 'Green'
$CorAlerta  = 'Yellow'
$CorErro    = 'Red'
$CorMarca   = 'DarkCyan'

try {
    # Codepage do console para UTF-8: sem isso, acentos e os simbolos de caixa
    # desenhados abaixo viram interrogacao ou caractere errado em consoles com
    # codepage regional (comum no Brasil: 850/860), mesmo com o arquivo certo.
    & chcp.com 65001 > $null
    [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
} catch {
    # Console que nao aceita a troca de codepage: segue com o padrao do host.
}

try {
    $Host.UI.RawUI.WindowTitle = 'NewSec Focus — Instalacao'
    $tam = $Host.UI.RawUI.WindowSize
    if ($tam.Width -lt 92) {
        $tam.Width = 92
        $Host.UI.RawUI.WindowSize = $tam
        $buf = $Host.UI.RawUI.BufferSize
        $buf.Width = 92
        $Host.UI.RawUI.BufferSize = $buf
    }
} catch {
    # Alguns hosts (ISE, terminais remotos) nao deixam redimensionar. Segue sem isso.
}

function Escrever-Linha {
    param([string]$Texto = '', [string]$Cor = $CorTexto, [switch]$SemQuebra)
    if ($SemQuebra) { Write-Host $Texto -ForegroundColor $Cor -NoNewline }
    else { Write-Host $Texto -ForegroundColor $Cor }
}

function Escrever-Moldura {
    param([string[]]$Linhas, [string]$Cor = $CorTitulo)
    $largura = 74
    Escrever-Linha ('╔' + ('═' * $largura) + '╗') $Cor
    foreach ($linha in $Linhas) {
        $pad = $largura - 2 - $linha.Length
        if ($pad -lt 0) { $pad = 0 }
        $esq = [math]::Floor($pad / 2)
        $dir = $pad - $esq
        Escrever-Linha ('║ ' + (' ' * $esq) + $linha + (' ' * $dir) + ' ║') $Cor
    }
    Escrever-Linha ('╚' + ('═' * $largura) + '╝') $Cor
}

function Escrever-Secao {
    param([string]$Titulo)
    Write-Host ''
    Escrever-Linha ('── ' + $Titulo + ' ' + ('─' * [math]::Max(0, 68 - $Titulo.Length))) $CorMarca
}

function Escrever-Passo {
    param([string]$Texto, [scriptblock]$Acao)
    Escrever-Linha '   › ' $CorMarca -SemQuebra
    Escrever-Linha $Texto $CorTexto -SemQuebra
    try {
        & $Acao | Out-Null
        Escrever-Linha '  ✓' $CorSucesso
        return $true
    } catch {
        Escrever-Linha '  ✗' $CorErro
        Escrever-Linha "     $($_.Exception.Message)" $CorErro
        return $false
    }
}

function Sair-ComPausa {
    param([int]$Codigo = 0)
    Write-Host ''
    Escrever-Linha 'Pressione ENTER para fechar...' 'DarkGray'
    [void](Read-Host)
    exit $Codigo
}

Clear-Host
Escrever-Moldura @('NewSec Focus', 'Instalacao do agente de produtividade') $CorTitulo
Write-Host ''

# ----------------------------------------------------------------------------
#  1. Elevacao — o servico Windows so pode ser criado como Administrador
# ----------------------------------------------------------------------------
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$souAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $souAdmin) {
    Escrever-Linha 'Este instalador precisa de permissao de Administrador.' $CorAlerta
    Escrever-Linha 'Uma janela do Windows vai pedir essa confirmacao agora...' $CorTexto
    Write-Host ''
    try {
        Start-Process -FilePath 'powershell.exe' `
            -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"") `
            -Verb RunAs | Out-Null
    } catch {
        Escrever-Linha 'A elevacao foi cancelada. Sem ela, a instalacao nao pode continuar.' $CorErro
        Sair-ComPausa 1
    }
    exit 0
}

# ----------------------------------------------------------------------------
#  2. Termo de transparencia
# ----------------------------------------------------------------------------
Escrever-Secao 'O que este agente faz'
Escrever-Linha '  Esta estacao vai registrar, por minuto:' $CorTexto
Escrever-Linha '    • o aplicativo em primeiro plano e o titulo da janela (numeros longos ocultados)' $CorTexto
Escrever-Linha '    • o dominio de sites abertos no navegador — nunca o endereco completo' $CorTexto
Escrever-Linha '    • a quantidade de teclas, cliques e rolagens — nunca o que foi digitado' $CorTexto
Escrever-Linha '    • periodos de inatividade e de tela bloqueada' $CorTexto
Write-Host ''
Escrever-Linha '  NUNCA registra: conteudo digitado, capturas de tela, mensagens ou senhas.' $CorSucesso
Escrever-Linha '  Um icone na barra de tarefas avisa o usuario de que a estacao e monitorada.' $CorTexto
Write-Host ''
Escrever-Linha '  Prosseguindo, voce confirma estar autorizado pela empresa contratante.' 'White'
Write-Host ''

$resposta = Read-Host '  Continuar com a instalacao? (S/N)'
if ($resposta -notmatch '^[sS]') {
    Escrever-Linha 'Instalacao cancelada pelo usuario.' $CorAlerta
    Sair-ComPausa 0
}

# ----------------------------------------------------------------------------
#  3. Codigo de instalacao
# ----------------------------------------------------------------------------
Escrever-Secao 'Codigo de instalacao'
Escrever-Linha '  Esta em Administracao > Empresa no painel, no formato 1234-5678-9012.' $CorTexto
Write-Host ''

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$codigo = $null
$nomeEmpresa = $null

for ($tentativa = 1; $tentativa -le 5; $tentativa++) {
    $bruto = Read-Host '  Codigo da empresa'
    $digitos = ($bruto -replace '\D', '')

    if ($digitos.Length -ne 12) {
        Escrever-Linha "  Isso nao parece um codigo valido (precisa ter 12 digitos; veio com $($digitos.Length))." $CorErro
        Write-Host ''
        continue
    }

    $formatado = $digitos -replace '(\d{4})(?=\d)', '$1-'
    Escrever-Linha "  Verificando $formatado..." 'DarkGray' -SemQuebra

    try {
        $resp = Invoke-RestMethod -Method Post `
            -Uri "$UrlSupabase/functions/v1/validar-codigo" `
            -Headers @{ apikey = $ChaveAnonima; Authorization = "Bearer $ChaveAnonima" } `
            -ContentType 'application/json' `
            -Body (@{ codigo = $digitos } | ConvertTo-Json) `
            -TimeoutSec 8

        if ($resp.valido) {
            $nomeEmpresa = $resp.empresa
            Escrever-Linha "  ✓ Codigo valido — empresa: $nomeEmpresa" $CorSucesso
            if ($resp.conta_ativa -eq $false) {
                Escrever-Linha '  ATENCAO: esta conta esta suspensa. A instalacao segue, mas a coleta ficara pausada.' $CorAlerta
            }
            $codigo = $digitos
            break
        } else {
            Escrever-Linha '  ✗ Codigo nao encontrado. Confira no painel e tente de novo.' $CorErro
            Write-Host ''
            continue
        }
    } catch {
        # Sem internet, ou a validacao ainda nao esta publicada: segue no formato,
        # e o proprio servico confere o codigo de verdade no primeiro contato.
        Escrever-Linha '  (nao foi possivel validar agora — a instalacao segue e a conferencia final acontece ao ligar o servico)' 'DarkGray'
        $codigo = $digitos
        break
    }
}

if (-not $codigo) {
    Escrever-Linha 'Numero maximo de tentativas. Rode o instalador de novo quando tiver o codigo correto.' $CorErro
    Sair-ComPausa 1
}

Write-Host ''
$confirmar = Read-Host '  Instalar agora nesta estacao? (S/N)'
if ($confirmar -notmatch '^[sS]') {
    Escrever-Linha 'Instalacao cancelada.' $CorAlerta
    Sair-ComPausa 0
}

# ----------------------------------------------------------------------------
#  4. Instalacao
# ----------------------------------------------------------------------------
Escrever-Secao 'Instalando'

$origem = $PSScriptRoot
$exeServico = Join-Path $PastaInstalacao 'Telemetria.Servico.exe'

$ok = $true

$ok = $ok -and (Escrever-Passo "Parando versao anterior (se houver)" {
    & sc.exe stop $NomeServico 2>&1 | Out-Null
    Start-Sleep -Milliseconds 400
    & sc.exe delete $NomeServico 2>&1 | Out-Null
    $true
})

$ok = $ok -and (Escrever-Passo "Copiando arquivos para $PastaInstalacao" {
    New-Item -ItemType Directory -Path $PastaInstalacao -Force | Out-Null
    Get-ChildItem -Path $origem -Force |
        Where-Object { $_.Name -notin @('Instalar.bat', 'Instalar.ps1', 'Desinstalar.bat', 'Desinstalar.ps1', 'Licenca.rtf') } |
        ForEach-Object {
            Copy-Item -Path $_.FullName -Destination $PastaInstalacao -Recurse -Force
        }
    if (-not (Test-Path $exeServico)) { throw 'Telemetria.Servico.exe nao encontrado na pasta do instalador.' }
})

$ok = $ok -and (Escrever-Passo "Preparando a pasta de dados protegida" {
    New-Item -ItemType Directory -Path $PastaDados -Force | Out-Null
    & icacls $PastaDados /inheritance:r | Out-Null
    & icacls $PastaDados /grant:r '*S-1-5-18:(OI)(CI)F' | Out-Null       # SYSTEM
    & icacls $PastaDados /grant:r '*S-1-5-32-544:(OI)(CI)F' | Out-Null  # Administradores
    & icacls $PastaDados /grant:r '*S-1-5-11:(OI)(CI)M' | Out-Null      # Usuarios autenticados
})

$ok = $ok -and (Escrever-Passo "Gravando a identidade da empresa" {
    New-Item -Path $ChaveRegistro -Force | Out-Null
    New-ItemProperty -Path $ChaveRegistro -Name 'UrlSupabase'    -Value $UrlSupabase  -PropertyType String -Force | Out-Null
    New-ItemProperty -Path $ChaveRegistro -Name 'ChaveAnonima'   -Value $ChaveAnonima -PropertyType String -Force | Out-Null
    New-ItemProperty -Path $ChaveRegistro -Name 'ChaveMatricula' -Value $codigo       -PropertyType String -Force | Out-Null
})

$ok = $ok -and (Escrever-Passo "Criando o servico Windows" {
    $parametrosServico = @(
        'create', $NomeServico,
        'binPath=', "`"$exeServico`"",
        'start=', 'delayed-auto',
        'obj=', 'NT AUTHORITY\SYSTEM',
        'DisplayName=', $NomeExibicao
    )
    $r = & sc.exe @parametrosServico
    if ($LASTEXITCODE -ne 0) { throw "sc.exe create falhou: $r" }

    & sc.exe description $NomeServico 'Coleta de metadados de produtividade em conformidade com a LGPD. Nao registra conteudo digitado, telas ou mensagens.' | Out-Null
    & sc.exe failure $NomeServico reset= 86400 actions= restart/5000/restart/10000/restart/30000 | Out-Null
})

$ok = $ok -and (Escrever-Passo "Iniciando o servico" {
    & sc.exe start $NomeServico | Out-Null
    Start-Sleep -Seconds 2
    $svc = Get-Service -Name $NomeServico -ErrorAction SilentlyContinue
    if (-not $svc -or $svc.Status -ne 'Running') {
        throw ('O servico nao ficou em execucao. Veja os logs em ' + (Join-Path $PastaDados 'logs'))
    }
})

# ----------------------------------------------------------------------------
#  5. Resultado
# ----------------------------------------------------------------------------
Write-Host ''
if ($ok) {
    $rotuloEmpresa = if ($nomeEmpresa) { $nomeEmpresa } else { 'empresa configurada' }
    Escrever-Moldura @('Instalacao concluida', "Estacao registrada para: $rotuloEmpresa") $CorSucesso
    Write-Host ''
    Escrever-Linha '  A estacao aparece no painel, em Dispositivos, em ate uma hora' $CorTexto
    Escrever-Linha '  (o primeiro envio acontece pouco depois do servico iniciar).' $CorTexto
    Escrever-Linha "  Dados locais: $PastaDados" 'DarkGray'
} else {
    Escrever-Moldura @('A instalacao nao terminou', 'Veja o passo marcado com X acima') $CorErro
    Escrever-Linha "  Logs, se existirem: $(Join-Path $PastaDados 'logs')" $CorTexto
}

Sair-ComPausa ([int](-not $ok))
