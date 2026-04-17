@echo off
setlocal
set "DIR=%~1"
if "%DIR%"=="" set "DIR=."

for %%I in ("%DIR%") do set "TARGET_DIR=%%~fI"
if not exist "%TARGET_DIR%\" (
  echo Error: Invalid directory
  exit /b 1
)

set "APP_EXE=%LOCALAPPDATA%\Programs\OpenCodex\OpenCodex.exe"
if not exist "%APP_EXE%" (
  echo Error: OpenCodex.exe not found at "%APP_EXE%"
  exit /b 1
)

start "" "%APP_EXE%" "%TARGET_DIR%"
