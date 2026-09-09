@echo off
REM ============================================================================
REM  NewSec Focus - Diagnostico
REM
REM  Clique duas vezes numa maquina onde o agente "nao aparece no painel". Ele
REM  le o estado local, testa a conexao com o servidor e grava um relatorio na
REM  Area de Trabalho para mandar ao suporte.
REM
REM  So LE — nao instala, nao altera nada, nao baixa nada da internet (esta
REM  ultima parte importa: baixar-e-executar e o padrao que o Defender bloqueia
REM  como ClickFix).
REM ============================================================================
title NewSec Focus - Diagnostico
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0agente\Diagnostico.ps1"
if errorlevel 1 powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Diagnostico.ps1"
