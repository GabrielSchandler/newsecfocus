@echo off
REM ============================================================================
REM  Remove o Agente de Telemetria de Produtividade. Rodar como ADMINISTRADOR.
REM  Por padrao PRESERVA os dados coletados ainda nao enviados (buffer local).
REM  Passe o argumento  purgar  para apagar tambem a pasta de dados.
REM     uninstall_service.bat            -> remove servico e binarios
REM     uninstall_service.bat purgar     -> remove tudo, inclusive o buffer
REM ============================================================================
setlocal

set "NOME_SERVICO=TelemetriaProdutividade"
set "PASTA_INSTALL=%ProgramFiles%\TelemetriaProdutividade"
set "DADOS=%ProgramData%\TelemetriaProdutividade"

net session >nul 2>&1
if errorlevel 1 (
    echo *** Este script precisa ser executado como Administrador.
    exit /b 1
)

echo === Parando e removendo o servico...
sc stop "%NOME_SERVICO%" >nul 2>&1
sc delete "%NOME_SERVICO%" >nul 2>&1

echo === Encerrando coletores em execucao...
taskkill /f /im Telemetria.Coletor.exe >nul 2>&1

echo === Removendo binarios em %PASTA_INSTALL%...
if exist "%PASTA_INSTALL%" rmdir /s /q "%PASTA_INSTALL%"

if /i "%~1"=="purgar" (
    echo === Purgando dados locais em %DADOS%...
    if exist "%DADOS%" rmdir /s /q "%DADOS%"
) else (
    echo === Dados locais preservados em %DADOS% ^(use "purgar" para apagar^).
)

echo === Concluido.
endlocal
