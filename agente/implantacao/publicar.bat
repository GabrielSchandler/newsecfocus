@echo off
REM ============================================================================
REM  Publica o agente completo (servico + coletor) numa pasta pronta para
REM  instalar. O coletor vai para uma subpasta "coletor" ao lado do servico,
REM  que e onde o LancadorSessao procura Telemetria.Coletor.exe.
REM
REM  Uso:  publicar.bat  [pasta_de_saida]
REM  Padrao de saida: .\publicado
REM ============================================================================
setlocal enabledelayedexpansion

set "RAIZ=%~dp0.."
set "SAIDA=%~1"
if "%SAIDA%"=="" set "SAIDA=%RAIZ%\publicado"

REM ----------------------------------------------------------------------------
REM  Localiza um dotnet que tenha SDK.
REM
REM  A maquina pode ter apenas o RUNTIME do .NET em "C:\Program Files\dotnet"
REM  (que e o que fica no PATH) e o SDK instalado por usuario em LOCALAPPDATA.
REM  Nesse caso, chamar "dotnet" direto falha com "could not be loaded" — por
REM  isso procuramos antes de publicar, em vez de quebrar no meio.
REM ----------------------------------------------------------------------------
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
echo === Publicando o servico supervisor (win-x64)...
"%DOTNET%" publish "%RAIZ%\src\Telemetria.Servico\Telemetria.Servico.csproj" ^
    -c Release -r win-x64 --self-contained false ^
    -o "%SAIDA%"
if errorlevel 1 goto :erro

echo.
echo === Publicando o coletor de sessao (win-x64)...
"%DOTNET%" publish "%RAIZ%\src\Telemetria.Coletor\Telemetria.Coletor.csproj" ^
    -c Release -r win-x64 --self-contained false ^
    -o "%SAIDA%\coletor"
if errorlevel 1 goto :erro

echo.
echo === Copiando scripts de servico...
copy /y "%~dp0install_service.bat"   "%SAIDA%\install_service.bat"   >nul
copy /y "%~dp0uninstall_service.bat" "%SAIDA%\uninstall_service.bat" >nul

echo.
echo ============================================================================
echo  Publicado em: %SAIDA%
echo  Proximo passo: editar appsettings.json (URL/chaves) e rodar install_service.bat
echo  como Administrador.
echo ============================================================================
goto :fim

:erro
echo.
echo *** Falha na publicacao. Veja as mensagens acima.
exit /b 1

:fim
endlocal
