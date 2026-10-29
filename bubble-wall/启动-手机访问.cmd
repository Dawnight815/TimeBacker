@echo off
setlocal
title Bubble Timeline - Phone Access
cd /d "%~dp0"
chcp 65001 >nul

where node >nul 2>nul
if errorlevel 1 goto NONODE

node "%~dp0serve.js"

echo.
echo   Server stopped. You can close this window.
pause
exit /b 0

:NONODE
echo.
echo   Node.js was not found on this PC.
echo   The page still opens with index.html on this computer,
echo   but the phone needs this small server. Please install Node.js first.
echo.
pause
exit /b 1
