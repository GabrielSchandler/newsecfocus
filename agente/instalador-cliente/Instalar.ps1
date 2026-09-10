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
            $equipesEmpresa = $resp.equipes
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

# ----------------------------------------------------------------------------
#  3b. Como esta estacao vai aparecer no painel
#
#  Antes, a estacao entrava no site com o nome do Windows e sem departamento —
#  e alguem tinha de arrumar depois, procurando a maquina certa no meio das
#  outras. Quem instala e quem sabe de qual sala e de qual setor ela e, entao a
#  escolha passou para ca.
#
#  Sao DUAS perguntas de proposito. Ate a 1.4 havia so "nome desta maquina", e
#  na segunda instalacao real (10/09/2026) quem instalou digitou "Robson" ali:
#  o nome foi para a ESTACAO, e a PESSOA — que e o que o painel mais mostra —
#  nasceu com o nome da conta do Windows, "Usuario".
# ----------------------------------------------------------------------------
Escrever-Secao 'Como esta estacao vai aparecer no painel'

# --- Pessoa -------------------------------------------------------------------
Escrever-Linha '  Quem usa esta maquina?' $CorTexto
Escrever-Linha '  E o nome que aparece em Pessoas, rankings e horas extras.' 'DarkGray'
$nomeColaborador = ''
for ($i = 1; $i -le 3; $i++) {
    $escolhido = (Read-Host '  Nome da pessoa (ENTER para deixar para depois)').Trim()
    if ([string]::IsNullOrWhiteSpace($escolhido)) { break }
    if ($escolhido.Length -gt 80) {
        Escrever-Linha '  No maximo 80 caracteres.' $CorErro
        continue
    }
    $nomeColaborador = $escolhido
    break
}
if ($nomeColaborador) {
    Escrever-Linha "  → Pessoa: $nomeColaborador" $CorSucesso
} else {
    Escrever-Linha '  → Sem nome agora: aparece com o nome da conta do Windows ate alguem ajustar no painel.' $CorAlerta
}

# --- Estacao ------------------------------------------------------------------
Write-Host ''
$nomeAutomatico = $env:COMPUTERNAME
$nomeExibicao   = $nomeAutomatico

Escrever-Linha "  Nome da estacao (o computador):  $nomeAutomatico" $CorTexto
Escrever-Linha '  E como a maquina aparece na lista de Dispositivos.' 'DarkGray'
$trocar = Read-Host '  Quer dar outro nome a estacao? (s/N)'

if ($trocar -match '^[sS]') {
    for ($i = 1; $i -le 3; $i++) {
        $escolhido = (Read-Host '  Nome da estacao').Trim()
        if ([string]::IsNullOrWhiteSpace($escolhido)) {
            Escrever-Linha '  Nome vazio — mantendo o detectado.' $CorAlerta
            break
        }
        if ($escolhido.Length -gt 60) {
            Escrever-Linha '  No maximo 60 caracteres.' $CorErro
            continue
        }
        $nomeExibicao = $escolhido
        break
    }
}

Escrever-Linha "  → Estacao: $nomeExibicao" $CorSucesso

# --- Departamento -------------------------------------------------------------
$equipeId = ''
$nomeEquipe = ''

if ($equipesEmpresa -and @($equipesEmpresa).Count -gt 0) {
    $lista = @($equipesEmpresa)
    Write-Host ''
    Escrever-Linha '  Departamento desta maquina:' $CorTexto
    Escrever-Linha '    0) Deixar sem departamento (define depois no painel)' 'DarkGray'
    for ($i = 0; $i -lt $lista.Count; $i++) {
        Escrever-Linha ("    {0}) {1}" -f ($i + 1), $lista[$i].nome) $CorTexto
    }
    Write-Host ''

    for ($tent = 1; $tent -le 3; $tent++) {
        $op = (Read-Host '  Numero do departamento').Trim()
        if ($op -eq '0' -or [string]::IsNullOrWhiteSpace($op)) {
            Escrever-Linha '  → Sem departamento por enquanto.' $CorAlerta
            break
        }
        $n = 0
        if ([int]::TryParse($op, [ref]$n) -and $n -ge 1 -and $n -le $lista.Count) {
            $equipeId = $lista[$n - 1].id
            $nomeEquipe = $lista[$n - 1].nome
            Escrever-Linha ("  → Departamento: {0}" -f $lista[$n - 1].nome) $CorSucesso
            break
        }
        Escrever-Linha "  Escolha um numero entre 0 e $($lista.Count)." $CorErro
    }
} else {
    # Sem internet na validacao, ou empresa que ainda nao criou equipe nenhuma.
    Escrever-Linha '  (nenhum departamento cadastrado nesta empresa — define depois no painel)' 'DarkGray'
}

Write-Host ''
Escrever-Linha '  Vai aparecer no painel assim:' $CorTexto
Escrever-Linha ('    Pessoa:        ' + $(if ($nomeColaborador) { $nomeColaborador } else { '(nome da conta do Windows)' })) 'White'
Escrever-Linha ('    Estacao:       ' + $nomeExibicao) 'White'
Escrever-Linha ('    Departamento:  ' + $(if ($nomeEquipe) { $nomeEquipe } else { '(nenhum)' })) 'White'
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

# Os binarios ficam numa subpasta 'agente' dentro do zip, para quem extrai ver
# so o Instalar.bat em vez de 500 DLLs soltas. Se a subpasta nao existir, cai
# no comportamento antigo (tudo ao lado do script) — util em quem ja tem o
# pacote plano e para o desenvolvimento.
$origem = Join-Path $PSScriptRoot 'agente'
if (-not (Test-Path (Join-Path $origem 'Telemetria.Servico.exe'))) {
    $origem = $PSScriptRoot
}

# A versao e lida do proprio binario que esta sendo instalado. Ela nomeia a
# pasta, e e o que permite a maquina se atualizar depois sem ninguem ir ate la:
# as versoes ficam lado a lado e o servico so muda para qual delas aponta.
# Sobrescrever binario em uso e o que travou uma reinstalacao real em
# 03/09/2026, com o Windows segurando um DLL do coletor.
$exeOrigem = Join-Path $origem 'Telemetria.Servico.exe'
if (-not (Test-Path $exeOrigem)) {
    Escrever-Linha 'Telemetria.Servico.exe nao encontrado na pasta do instalador.' $CorErro
    Sair-ComPausa 1
}
$Versao = (Get-Item $exeOrigem).VersionInfo.FileVersion
if (-not $Versao) { $Versao = '1.0.0.0' }

$PastaVersoes = Join-Path $PastaInstalacao 'versoes'
$PastaVersao  = Join-Path $PastaVersoes $Versao
$exeServico   = Join-Path $PastaVersao 'Telemetria.Servico.exe'

$ok = $true

$ok = $ok -and (Escrever-Passo "Parando versao anterior (se houver)" {
    $servicoAntigo = Get-Service -Name $NomeServico -ErrorAction SilentlyContinue
    if ($servicoAntigo) {
        & sc.exe stop $NomeServico 2>&1 | Out-Null

        # Espera de verdade o processo antigo sair da memoria — sem isso, o
        # `sc.exe create` seguinte pode falhar (servico "pendente de exclusao")
        # ou, pior, ter sucesso sem que o processo antigo tenha realmente
        # morrido, deixando o binario ANTIGO rodando enquanto os arquivos NOVOS
        # sao copiados por cima. Foi exatamente isso que aconteceu na primeira
        # vez que este script rodou numa maquina real (03/09/2026): o PID do
        # servico continuou o mesmo antes e depois de uma "reinstalacao".
        $limite = (Get-Date).AddSeconds(15)
        while ((Get-Process -Name 'Telemetria.Servico' -ErrorAction SilentlyContinue) -and (Get-Date) -lt $limite) {
            Start-Sleep -Milliseconds 300
        }
        Get-Process -Name 'Telemetria.Servico' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

        & sc.exe delete $NomeServico 2>&1 | Out-Null

        # sc.exe delete e assincrono no SCM: o nome pode ficar "pendente de
        # exclusao" por um instante antes de liberar de verdade para recriar.
        $limite2 = (Get-Date).AddSeconds(10)
        while ((Get-Service -Name $NomeServico -ErrorAction SilentlyContinue) -and (Get-Date) -lt $limite2) {
            Start-Sleep -Milliseconds 300
        }
    }
    # O Coletor roda na sessao do usuario, fora do controle do SCM: matar o
    # servico nao garante que ele ja morreu. Sem esperar aqui tambem, o
    # Accessibility.dll (carregado pelo WinForms) ainda estava com o handle
    # aberto quando o passo seguinte tentava sobrescrever — foi o que travou
    # a reinstalacao numa maquina real (03/09/2026): "O processo nao pode
    # acessar o arquivo [...] Accessibility.dll porque ele esta sendo usado
    # por outro processo."
    Get-Process -Name 'Telemetria.Coletor' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    $limite3 = (Get-Date).AddSeconds(10)
    while ((Get-Process -Name 'Telemetria.Coletor' -ErrorAction SilentlyContinue) -and (Get-Date) -lt $limite3) {
        Start-Sleep -Milliseconds 300
    }
    $true
})

$ok = $ok -and (Escrever-Passo "Instalando a versao $Versao" {
    New-Item -ItemType Directory -Path $PastaVersao -Force | Out-Null
    $arquivos = Get-ChildItem -Path $origem -Force |
        Where-Object { $_.Name -notin @('Instalar.bat', 'Instalar.ps1', 'Desinstalar.bat', 'Desinstalar.ps1', 'Licenca.rtf') }

    foreach ($item in $arquivos) {
        # Mesmo com o processo ja encerrado, o Windows (ou um antivirus fazendo
        # varredura em tempo real) pode segurar o handle por mais alguns
        # instantes. Tenta novamente por ate 5s antes de desistir de verdade.
        $limiteCopia = (Get-Date).AddSeconds(5)
        while ($true) {
            try {
                Copy-Item -Path $item.FullName -Destination $PastaVersao -Recurse -Force
                break
            } catch {
                if ((Get-Date) -ge $limiteCopia) { throw }
                Start-Sleep -Milliseconds 400
            }
        }
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
    # O que o instalador escolheu sobre a identidade desta maquina. O servico le
    # daqui e manda na matricula, entao a estacao ja nasce certa no painel.
    New-ItemProperty -Path $ChaveRegistro -Name 'NomeExibicao'   -Value $nomeExibicao -PropertyType String -Force | Out-Null
    New-ItemProperty -Path $ChaveRegistro -Name 'EquipeId'       -Value $equipeId     -PropertyType String -Force | Out-Null
    New-ItemProperty -Path $ChaveRegistro -Name 'NomeColaborador' -Value $nomeColaborador -PropertyType String -Force | Out-Null
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

# Uma reinstalacao reaproveitava o token da matricula anterior, e o servico
# nunca reenviava as escolhas novas (pessoa, estacao, departamento). Sem o
# token, ele matricula de novo — o servidor reconhece a maquina pelo hardware
# e atualiza o MESMO registro, sem duplicar a estacao.
$tokenAntigo = Join-Path $PastaDados 'dispositivo.bin'
if (Test-Path $tokenAntigo) { Remove-Item $tokenAntigo -Force -ErrorAction SilentlyContinue }

# Marca onde o log esta agora, para so considerar o que for escrito depois:
# o arquivo acumula as execucoes anteriores, inclusive matriculas antigas.
$logServico      = Join-Path $PastaDados 'logs\servico.log'
$tamanhoLogAntes = if (Test-Path $logServico) { (Get-Item $logServico).Length } else { 0 }

$ok = $ok -and (Escrever-Passo "Iniciando o servico" {
    & sc.exe start $NomeServico | Out-Null
    Start-Sleep -Seconds 2
    $svc = Get-Service -Name $NomeServico -ErrorAction SilentlyContinue
    if (-not $svc -or $svc.Status -ne 'Running') {
        throw ('O servico nao ficou em execucao. Veja os logs em ' + (Join-Path $PastaDados 'logs'))
    }
})

# ----------------------------------------------------------------------------
#  4b. Confirmar que a estacao ja esta no painel
#
#  Quem instala precisa saber NA HORA se deu certo. Antes a mensagem era "a
#  estacao aparece em ate uma hora", e a segunda instalacao real levou 7
#  minutos para aparecer — tempo de sobra para achar que tinha falhado.
# ----------------------------------------------------------------------------
function Log-TemDesde {
    param([string]$Arquivo, [long]$Desde, [string]$Padrao)
    if (-not (Test-Path $Arquivo)) { return $false }
    try {
        # FileShare ReadWrite: o servico mantem o arquivo aberto para escrita.
        $fs = [IO.File]::Open($Arquivo, 'Open', 'Read', 'ReadWrite')
        try {
            if ($fs.Length -lt $Desde) { $Desde = 0 }   # arquivo recriado
            if ($fs.Length -eq $Desde) { return $false }
            [void]$fs.Seek($Desde, 'Begin')
            $leitor = New-Object IO.StreamReader($fs, [Text.Encoding]::UTF8)
            return ($leitor.ReadToEnd() -match $Padrao)
        } finally { $fs.Dispose() }
    } catch { return $false }
}

$registrada = $false
if ($ok) {
    Escrever-Linha '   › ' $CorMarca -SemQuebra
    Escrever-Linha 'Registrando a estacao no painel' $CorTexto -SemQuebra
    $limiteRegistro = (Get-Date).AddSeconds(45)
    while ((Get-Date) -lt $limiteRegistro) {
        if (Log-TemDesde $logServico $tamanhoLogAntes 'matriculada') { $registrada = $true; break }
        Start-Sleep -Seconds 1
        Escrever-Linha '.' 'DarkGray' -SemQuebra
    }
    if ($registrada) {
        Escrever-Linha '  ✓' $CorSucesso
    } else {
        Escrever-Linha '  (ainda nao confirmou)' $CorAlerta
    }
}

# ----------------------------------------------------------------------------
#  5. Resultado
# ----------------------------------------------------------------------------
Write-Host ''
if ($ok) {
    $rotuloEmpresa = if ($nomeEmpresa) { $nomeEmpresa } else { 'empresa configurada' }
    Escrever-Moldura @('Instalacao concluida', "Estacao registrada para: $rotuloEmpresa") $CorSucesso
    Write-Host ''
    if ($registrada) {
        Escrever-Linha '  A estacao ja aparece no painel, em Dispositivos.' $CorTexto
    } else {
        Escrever-Linha '  A estacao aparece no painel, em Dispositivos, assim que a rede responder.' $CorTexto
        Escrever-Linha '  Se demorar mais de alguns minutos, rode o Diagnostico.bat.' $CorTexto
    }
    Escrever-Linha '  A pessoa entra em Pessoas em cerca de 2 minutos: o agente fecha um' $CorTexto
    Escrever-Linha '  minuto inteiro de atividade antes do primeiro envio.' $CorTexto
    Escrever-Linha "  Dados locais: $PastaDados" 'DarkGray'
} else {
    Escrever-Moldura @('A instalacao nao terminou', 'Veja o passo marcado com X acima') $CorErro
    Escrever-Linha "  Logs, se existirem: $(Join-Path $PastaDados 'logs')" $CorTexto
}

Sair-ComPausa ([int](-not $ok))
