@echo off
REM ============================================================================
REM  Gera o instalador NewSec Focus (MSI).
REM
REM  Publica o agente AUTO-CONTIDO — o runtime do .NET vai dentro do pacote, de
REM  modo que a maquina do cliente nao precisa ter nada instalado antes. Custa
REM  tamanho (cerca de 60 MB de MSI) e economiza uma classe inteira de chamado
REM  de suporte.
REM
REM  Pre-requisitos (uma vez, sem admin):
REM      dotnet tool install --global wix --version 5.0.2
REM      wix extension add -g WixToolset.Util.wixext/5.0.2
REM
REM  ATENCAO: o MSI resultante NAO esta assinado. Antes de distribuir a cliente,
REM  assinar com certificado de code signing — binario nao assinado que instala
REM  hooks de teclado e bloqueado por antivirus e SmartScreen.
REM      signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 NewSecFocus.msi
REM ============================================================================
setlocal enabledelayedexpansion

set "AQUI=%~dp0"
set "RAIZ=%AQUI%.."
set "PUBLICADO=%RAIZ%\publicado-msi"

REM --- Localiza um dotnet que tenha SDK (ver publicar.bat) ---
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
    echo *** .NET 8 SDK nao encontrado. Veja as instrucoes em publicar.bat.
    exit /b 1
)

where wix >nul 2>&1
if errorlevel 1 (
    echo *** WiX nao encontrado. Instale com:
    echo       dotnet tool install --global wix --version 5.0.2
    echo       wix extension add -g WixToolset.Util.wixext/5.0.2
    exit /b 1
)

echo.
echo === Limpando publicacao anterior
if exist "%PUBLICADO%" rmdir /s /q "%PUBLICADO%"

echo.
echo === Publicando o servico (auto-contido, win-x64)
"%DOTNET%" publish "%RAIZ%\src\Telemetria.Servico\Telemetria.Servico.csproj" ^
    -c Release -r win-x64 --self-contained true -o "%PUBLICADO%" --nologo
if errorlevel 1 goto :erro

echo.
echo === Publicando o coletor (auto-contido, win-x64)
"%DOTNET%" publish "%RAIZ%\src\Telemetria.Coletor\Telemetria.Coletor.csproj" ^
    -c Release -r win-x64 --self-contained true -o "%PUBLICADO%\coletor" --nologo
if errorlevel 1 goto :erro

echo.
echo === Gerando a lista de arquivos do instalador
python "%AQUI%gerar-arquivos.py" "%PUBLICADO%"
if errorlevel 1 goto :erro

echo.
echo === Compilando o MSI
pushd "%AQUI%"
REM A URL e a chave publica do servico sao iguais para todos os clientes e
REM entram embutidas; a tela do instalador so pergunta o codigo da empresa.
if "%FOCUS_URL%"=="" set "FOCUS_URL=https://auwotdrgxjrrhhhmmekc.supabase.co"
if "%FOCUS_ANON%"=="" (
    echo *** Defina FOCUS_ANON com a chave anon do projeto antes de gerar o MSI.
    exit /b 1
)

wix build NewSecFocus.wxs Arquivos.wxs Interface.wxs ^
    -ext WixToolset.Util.wixext ^
    -ext WixToolset.UI.wixext ^
    -bindpath "Publicado=%PUBLICADO%" ^
    -d Url=%FOCUS_URL% ^
    -d ChaveAnon=%FOCUS_ANON% ^
    -arch x64 ^
    -o NewSecFocus.msi
set "FALHOU=%errorlevel%"
popd
if not "%FALHOU%"=="0" goto :erro

echo.
echo ============================================================================
echo  Instalador pronto: %AQUI%NewSecFocus.msi
echo.
echo  Instalar numa maquina (como Administrador):
echo    msiexec /i NewSecFocus.msi /qn ^^
echo      URLSUPABASE=https://SEU-PROJETO.supabase.co ^^
echo      CHAVEANONIMA=SUA_CHAVE_ANON ^^
echo      CHAVEMATRICULA=CHAVE_DA_EMPRESA
echo.
echo  Desinstalar:  msiexec /x NewSecFocus.msi /qn
echo.
echo  *** ASSINAR antes de distribuir a cliente. ***
echo ============================================================================
goto :fim

:erro
echo.
echo *** Falha ao gerar o instalador. Veja as mensagens acima.
exit /b 1

:fim
endlocal
