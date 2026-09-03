#requires -Version 5.1
<#
============================================================================
 NewSec Focus — Desinstalador

 Por padrao PRESERVA os dados ja coletados que ainda nao subiram para o
 servidor (o buffer local). Passe -Purgar para apagar tudo, inclusive esse
 buffer — use só quando tiver certeza de que não precisa mais dele.
============================================================================
#>
param(
    [switch]$Purgar
)

$NomeServico     = 'TelemetriaProdutividade'
$PastaInstalacao = Join-Path $env:ProgramFiles 'NewSec Focus'
$PastaDados      = Join-Path $env:ProgramData 'TelemetriaProdutividade'
$ChaveRegistro   = 'HKLM:\SOFTWARE\NewSecFocus'

try {
    & chcp.com 65001 > $null
    [Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
} catch {}

function Linha($Texto, $Cor = 'Gray') { Write-Host $Texto -ForegroundColor $Cor }

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Linha 'Este desinstalador precisa de permissao de Administrador.' 'Yellow'
    try {
        $parametrosElevacao = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
        if ($Purgar) { $parametrosElevacao += '-Purgar' }
        Start-Process -FilePath 'powershell.exe' -ArgumentList $parametrosElevacao -Verb RunAs | Out-Null
    } catch {
        Linha 'Elevacao cancelada.' 'Red'
        Read-Host 'Pressione ENTER para fechar'
    }
    exit 0
}

Write-Host ''
Linha '=== NewSec Focus — Desinstalacao ===' 'Cyan'
Write-Host ''

Linha '> Parando e removendo o servico...' 'Gray'
& sc.exe stop $NomeServico 2>&1 | Out-Null
Start-Sleep -Milliseconds 500
& sc.exe delete $NomeServico 2>&1 | Out-Null

Linha '> Encerrando o coletor, se estiver em execucao...' 'Gray'
Get-Process -Name 'Telemetria.Coletor' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Linha "> Removendo arquivos em $PastaInstalacao..." 'Gray'
if (Test-Path $PastaInstalacao) { Remove-Item $PastaInstalacao -Recurse -Force -ErrorAction SilentlyContinue }

Linha '> Removendo a identidade gravada no registro...' 'Gray'
if (Test-Path $ChaveRegistro) { Remove-Item $ChaveRegistro -Recurse -Force -ErrorAction SilentlyContinue }

if ($Purgar) {
    Linha "> Apagando os dados locais em $PastaDados (--Purgar)..." 'Yellow'
    if (Test-Path $PastaDados) { Remove-Item $PastaDados -Recurse -Force -ErrorAction SilentlyContinue }
} else {
    Linha "> Dados locais preservados em $PastaDados (rode com -Purgar para apagar)." 'Gray'
}

Write-Host ''
Linha 'Desinstalacao concluida.' 'Green'
Write-Host ''
Read-Host 'Pressione ENTER para fechar'
