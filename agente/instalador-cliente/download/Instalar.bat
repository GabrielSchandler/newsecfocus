@echo off
REM ============================================================================
REM  NewSec Focus - Instalador
REM
REM  Este e o UNICO arquivo que o cliente baixa do site. Ele busca o pacote do
REM  agente, descompacta num local temporario, roda a instalacao e limpa tudo.
REM
REM  POR QUE NAO E O PACOTE INTEIRO
REM
REM  O agente sao mais de 500 arquivos, porque o runtime do .NET viaja junto
REM  para a maquina nao precisar de nada instalado antes. Entregar isso como zip
REM  fazia o cliente extrair uma pasta cheia de DLL e caçar o instalador no
REM  meio. Aqui ele ve um arquivo so, clica duas vezes, e acabou.
REM
REM  Para instalar em dezenas de maquinas sem baixar em cada uma, existe o zip
REM  completo (link ao lado deste, na tela de login): baixa uma vez, poe num
REM  compartilhamento e roda o Instalar.bat de dentro dele.
REM ============================================================================
title NewSec Focus - Instalacao

REM Eleva antes de baixar: criar servico do Windows exige administrador, e
REM descobrir isso depois de 97 MB de download seria cruel com quem instala.
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo   Este instalador precisa de permissao de Administrador.
    echo   Uma janela do Windows vai pedir essa confirmacao agora...
    echo.
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try{&chcp.com 65001>$null;[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)}catch{}; $b='https://auwotdrgxjrrhhhmmekc.supabase.co/storage/v1/object/public/agente/instalador'; $z=Join-Path $env:TEMP 'NewSecFocus-Instalador.zip'; $p=Join-Path $env:TEMP ('NewSecFocus-' + [guid]::NewGuid().ToString('N').Substring(0,8)); Write-Host ''; Write-Host '  NewSec Focus' -ForegroundColor Cyan; Write-Host ''; try{ try{ $i=Invoke-RestMethod -Uri ($b+'/atual.json') -TimeoutSec 15; Write-Host ('  Versao ' + $i.versao + ' - ' + [math]::Round($i.bytes/1MB) + ' MB') -ForegroundColor DarkGray }catch{}; Write-Host '  Baixando o agente (isso pode levar alguns minutos)...' -ForegroundColor Gray; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile(($b+'/NewSecFocus-Instalador.zip'),$z); Write-Host '  Descompactando...' -ForegroundColor Gray; if(Test-Path $p){Remove-Item $p -Recurse -Force}; Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory($z,$p); $s=(Get-ChildItem $p -Filter 'Instalar.ps1' -Recurse -File | Select-Object -First 1).FullName; if(-not $s){throw 'Pacote incompleto: Instalar.ps1 nao encontrado.'}; & $s }catch{ Write-Host ''; Write-Host ('  Nao foi possivel instalar: ' + $_.Exception.Message) -ForegroundColor Red; Write-Host '  Confira a conexao com a internet e tente de novo.' -ForegroundColor Gray; Write-Host ''; Read-Host '  Pressione ENTER para fechar' }finally{ try{if(Test-Path $z){Remove-Item $z -Force}}catch{}; try{if(Test-Path $p){Remove-Item $p -Recurse -Force}}catch{} }"
