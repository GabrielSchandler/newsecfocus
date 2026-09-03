@echo off
REM ============================================================================
REM  NewSec Focus — clique duas vezes para instalar.
REM
REM  So chama o PowerShell com o script ao lado (Instalar.ps1). A elevacao
REM  (pedido de "Executar como Administrador") e tratada DENTRO do proprio
REM  Instalar.ps1 — funciona tanto de duplo clique quanto pelo terminal.
REM ============================================================================
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Instalar.ps1"
