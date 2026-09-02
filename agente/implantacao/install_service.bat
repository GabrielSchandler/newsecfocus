@echo off
REM ============================================================================
REM  Instala o Agente de Telemetria de Produtividade como Windows Service.
REM  Precisa rodar como ADMINISTRADOR (clique direito > Executar como admin).
REM
REM  O servico roda sob NT AUTHORITY\SYSTEM, inicia no boot e se reinicia
REM  sozinho em caso de falha. Ele e quem lanca o coletor na sessao do usuario.
REM ============================================================================
setlocal

set "NOME_SERVICO=TelemetriaProdutividade"
set "PASTA_INSTALL=%ProgramFiles%\TelemetriaProdutividade"
set "EXE_SERVICO=%PASTA_INSTALL%\Telemetria.Servico.exe"
set "DADOS=%ProgramData%\TelemetriaProdutividade"

REM --- Verifica privilegio de administrador ---
net session >nul 2>&1
if errorlevel 1 (
    echo *** Este script precisa ser executado como Administrador.
    exit /b 1
)

echo.
echo === Copiando binarios para %PASTA_INSTALL%
if not exist "%PASTA_INSTALL%" mkdir "%PASTA_INSTALL%"
xcopy /e /i /y "%~dp0*" "%PASTA_INSTALL%\" >nul
REM Remove os proprios scripts .bat da pasta de binarios (nao sao necessarios la).
del /q "%PASTA_INSTALL%\install_service.bat"   2>nul
del /q "%PASTA_INSTALL%\uninstall_service.bat" 2>nul

echo.
echo === Preparando a pasta de dados protegida: %DADOS%
if not exist "%DADOS%" mkdir "%DADOS%"

REM ACL: quebra heranca, remove usuarios genericos e concede acesso especifico.
REM SYSTEM e Administradores com controle total; usuarios autenticados apenas
REM modificam (o coletor precisa gravar o telemetry.db), sem poder ler os arquivos
REM de chave/token (esses sao protegidos por DPAPI de maquina de qualquer forma).
icacls "%DADOS%" /inheritance:r >nul
icacls "%DADOS%" /grant:r "*S-1-5-18:(OI)(CI)F" >nul
icacls "%DADOS%" /grant:r "*S-1-5-32-544:(OI)(CI)F" >nul
icacls "%DADOS%" /grant:r "*S-1-5-11:(OI)(CI)M" >nul

echo.
echo === Criando o servico "%NOME_SERVICO%"
sc stop "%NOME_SERVICO%" >nul 2>&1
sc delete "%NOME_SERVICO%" >nul 2>&1

sc create "%NOME_SERVICO%" ^
    binPath= "\"%EXE_SERVICO%\"" ^
    start= auto ^
    obj= "NT AUTHORITY\SYSTEM" ^
    DisplayName= "Telemetria de Produtividade"
if errorlevel 1 (
    echo *** Falha ao criar o servico.
    exit /b 1
)

sc description "%NOME_SERVICO%" "Coleta de metadados de produtividade em conformidade com a LGPD. Nao registra conteudo digitado, telas ou mensagens."

REM Reinicio automatico: 1a falha em 5s, 2a em 10s, demais em 30s; janela de contagem 24h.
sc failure "%NOME_SERVICO%" reset= 86400 actions= restart/5000/restart/10000/restart/30000

REM Atraso de inicio para nao concorrer com o boot (delayed-auto-start).
sc config "%NOME_SERVICO%" start= delayed-auto >nul

echo.
echo === Iniciando o servico
sc start "%NOME_SERVICO%"

echo.
echo ============================================================================
echo  Instalacao concluida.
echo  Servico: %NOME_SERVICO%  (SYSTEM, inicio automatico, auto-restart)
echo  Dados:   %DADOS%
echo  Logs:    %DADOS%\logs
echo  Lembre de configurar URL e chaves em:
echo           %PASTA_INSTALL%\appsettings.json
echo  (ou empurre %DADOS%\configuracao.json por GPO)
echo ============================================================================

endlocal
