@echo off
REM Clique duas vezes para desinstalar o NewSec Focus. Preserva o buffer local
REM por padrao; para apagar tudo, abra um terminal e rode:
REM   powershell -ExecutionPolicy Bypass -File Desinstalar.ps1 -Purgar
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Desinstalar.ps1"
