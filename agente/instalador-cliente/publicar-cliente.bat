@echo off
REM ============================================================================
REM  Gera o pacote de instalacao para entregar ao cliente (sem MSI assinado).
REM
REM  Publica o agente AUTO-CONTIDO (o runtime do .NET vai dentro), copia os
REM  scripts Instalar/Desinstalar para a mesma pasta, e o resultado e o que
REM  se zipa e manda para o TI do cliente: ele so precisa extrair e clicar
REM  duas vezes em Instalar.bat.
REM ============================================================================
setlocal enabledelayedexpansion

set "AQUI=%~dp0"
set "RAIZ=%AQUI%.."
set "SAIDA=%RAIZ%\publicado-cliente"

REM --- Localiza um dotnet que tenha SDK (mesma logica do publicar.bat) ---
set "DOTNET="
where dotnet >nul 2>&1
if not errorlevel 1 (
    for /f "delims=" %%s in ('dotnet --list-sdks 2^>nul') do set "DOTNET=dotnet"
)
if not defined DOTNET (
    if exist "%LOCALAPPDATA%\Microsoft\dotnet\dotnet.exe" (
        for /f "delims=" %%s in ('"%LOCALAPPDATA%\Microsoft\dotnet\dotnet.exe" --list-sdks 2^>nul') do (
            set "DOTNET=%LOCALAPPDATA%\Microsoft\dotnet\dotnet.exe"
        )
    )
)
if not defined DOTNET (
    echo.
    echo *** .NET 8 SDK nao encontrado.
    echo     Instale com:  winget install Microsoft.DotNet.SDK.8
    echo     Ou, sem direitos de administrador:
    echo       powershell -c "iwr https://dot.net/v1/dotnet-install.ps1 -OutFile di.ps1; ./di.ps1 -Channel 8.0"
    exit /b 1
)

echo.
echo === SDK: "%DOTNET%"

echo.
echo === Limpando saida anterior: %SAIDA%
if exist "%SAIDA%" rmdir /s /q "%SAIDA%"
mkdir "%SAIDA%"

echo.
echo === Publicando o servico (auto-contido, win-x64)...
"%DOTNET%" publish "%RAIZ%\src\Telemetria.Servico\Telemetria.Servico.csproj" ^
    -c Release -r win-x64 --self-contained true -o "%SAIDA%"
if errorlevel 1 goto :erro

echo.
echo === Publicando o coletor de sessao (auto-contido, win-x64)...
"%DOTNET%" publish "%RAIZ%\src\Telemetria.Coletor\Telemetria.Coletor.csproj" ^
    -c Release -r win-x64 --self-contained true -o "%SAIDA%\coletor"
if errorlevel 1 goto :erro

echo.
echo === Copiando o instalador para a pasta do pacote...
copy /y "%AQUI%Instalar.bat"      "%SAIDA%\Instalar.bat"      >nul
copy /y "%AQUI%Instalar.ps1"      "%SAIDA%\Instalar.ps1"      >nul
copy /y "%AQUI%Desinstalar.bat"   "%SAIDA%\Desinstalar.bat"   >nul
copy /y "%AQUI%Desinstalar.ps1"   "%SAIDA%\Desinstalar.ps1"   >nul

echo.
echo ============================================================================
echo  Pacote pronto em: %SAIDA%
echo.
echo  Zipe essa pasta inteira e mande para o cliente. No computador dele:
echo    1. Extrair o zip
echo    2. Clicar duas vezes em Instalar.bat
echo    3. Colar o codigo de instalacao (Administracao ^> Empresa no painel)
echo.
echo  *** Sem assinatura de codigo: o Windows/antivirus pode avisar antes de
echo      rodar (SmartScreen, Editor desconhecido). Oriente o cliente a clicar
echo      em Mais informacoes e depois em Executar assim mesmo.
echo ============================================================================
goto :fim

:erro
echo.
echo *** Falha ao gerar o pacote. Veja as mensagens acima.
exit /b 1

:fim
endlocal
