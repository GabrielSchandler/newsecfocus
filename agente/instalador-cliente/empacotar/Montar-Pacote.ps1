$ErrorActionPreference='Stop'
$raiz   = 'C:\Users\Useer\Documents\GitHub\newsecfocus\agente'
$origem = Join-Path $raiz 'publicado-cliente'
$monta  = Join-Path $env:TEMP 'monta-pacote'
if (Test-Path $monta) { Remove-Item $monta -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $monta 'agente') -Force | Out-Null

# Na raiz do zip fica SO o que se clica. Todo o resto — inclusive os scripts
# do PowerShell — vai para dentro de 'agente', para quem extrai nao ter duvida
# sobre qual arquivo abrir.
$launcherInstalar = @'
@echo off
REM ============================================================================
REM  NewSec Focus - clique duas vezes para instalar.
REM
REM  Os arquivos do agente ficam na subpasta 'agente', junto do script que faz
REM  o trabalho. Aqui na raiz fica so o que se clica, para quem extrai o pacote
REM  nao precisar procurar nada.
REM
REM  A elevacao (pedido de "Executar como Administrador") e tratada dentro do
REM  proprio Instalar.ps1 — funciona tanto de duplo clique quanto pelo terminal.
REM ============================================================================
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0agente\Instalar.ps1"
'@
$launcherDiagnostico = @'
@echo off
REM Le o estado local e testa a conexao, para descobrir por que a maquina nao
REM aparece no painel. So le — nao instala nem altera nada.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0agente\Diagnostico.ps1"
'@
$launcherDesinstalar = @'
@echo off
REM Remove o agente desta maquina. Precisa de permissao de Administrador.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0agente\Desinstalar.ps1"
'@

[IO.File]::WriteAllText((Join-Path $monta 'Instalar.bat'), ($launcherInstalar -replace "`r?`n", "`r`n"), [Text.Encoding]::ASCII)
[IO.File]::WriteAllText((Join-Path $monta 'Desinstalar.bat'), ($launcherDesinstalar -replace "`r?`n", "`r`n"), [Text.Encoding]::ASCII)
[IO.File]::WriteAllText((Join-Path $monta 'Diagnostico.bat'), ($launcherDiagnostico -replace "`r?`n", "`r`n"), [Text.Encoding]::ASCII)

# Tudo o mais (inclusive os .ps1) vai para 'agente'.
Get-ChildItem $origem -Force |
  Where-Object { $_.Name -notin @('Instalar.bat','Desinstalar.bat','Diagnostico.bat') } |
  ForEach-Object { Copy-Item $_.FullName (Join-Path $monta 'agente') -Recurse -Force }

$zip = Join-Path $env:TEMP 'NewSecFocus-Instalador.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $monta '*') -DestinationPath $zip -CompressionLevel Optimal -Force

Write-Output ("raiz do zip: " + ((Get-ChildItem $monta | ForEach-Object { $_.Name }) -join ', '))
Write-Output ("dentro de agente: " + (Get-ChildItem (Join-Path $monta 'agente') -Recurse -File).Count)
Write-Output ("zip: " + [math]::Round((Get-Item $zip).Length/1MB) + " MB")
Remove-Item $monta -Recurse -Force
