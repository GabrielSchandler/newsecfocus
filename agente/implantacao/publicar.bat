@echo off
REM ============================================================================
REM  Publica o agente completo (servico + coletor) numa pasta pronta para
REM  instalar. O coletor vai para uma subpasta "coletor" ao lado do servico,
REM  que e onde o LancadorSessao procura Telemetria.Coletor.exe.
REM
REM  Uso:  publicar.bat  [pasta_de_saida]
REM  Padrao de saida: .\publicado
REM ============================================================================
setlocal

set "RAIZ=%~dp0.."
set "SAIDA=%~1"
if "%SAIDA%"=="" set "SAIDA=%RAIZ%\publicado"

echo.
echo === Limpando saida anterior: %SAIDA%
if exist "%SAIDA%" rmdir /s /q "%SAIDA%"
mkdir "%SAIDA%"

echo.
echo === Publicando o servico supervisor (win-x64)...
dotnet publish "%RAIZ%\src\Telemetria.Servico\Telemetria.Servico.csproj" ^
    -c Release -r win-x64 --self-contained false ^
    -o "%SAIDA%"
if errorlevel 1 goto :erro

echo.
echo === Publicando o coletor de sessao (win-x64)...
dotnet publish "%RAIZ%\src\Telemetria.Coletor\Telemetria.Coletor.csproj" ^
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
echo *** Falha na publicacao. Verifique se o .NET 8 SDK esta instalado (dotnet --version).
exit /b 1

:fim
endlocal
