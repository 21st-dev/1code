@echo off
set "COMMAND=%~1"
if "%COMMAND%"=="" set "COMMAND=open"

set "SCRIPT_DIR=%~dp0"
if "%LOCUS_HEADLESS_EXECUTABLE%"=="" (
  set "LOCUS_EXE=%SCRIPT_DIR%..\..\Locus.exe"
) else (
  set "LOCUS_EXE=%LOCUS_HEADLESS_EXECUTABLE%"
)

if "%COMMAND%"=="run" goto headless
if "%COMMAND%"=="jobs" goto headless
if "%COMMAND%"=="api" goto headless
if "%COMMAND%"=="daemon" goto headless
if "%COMMAND%"=="schedules" goto headless
if "%COMMAND%"=="schedule" goto headless
if "%COMMAND%"=="acp" goto headless
if "%COMMAND%"=="open" goto gui_open
if "%COMMAND%"=="gui" goto gui_open
goto gui_default

:headless
if not exist "%LOCUS_EXE%" (
  echo Error: Locus executable not found: %LOCUS_EXE% 1>&2
  exit /b 1
)
"%LOCUS_EXE%" --locus-headless-cli %*
exit /b %ERRORLEVEL%

:gui_open
shift
set "DIR=%~1"
if "%DIR%"=="" set "DIR=%CD%"
goto gui

:gui_default
set "DIR=%~1"
if "%DIR%"=="" set "DIR=%CD%"

:gui
for %%I in ("%DIR%") do set "ABS_DIR=%%~fI"

if not exist "%ABS_DIR%\" (
  echo Error: Invalid directory 1>&2
  exit /b 1
)

start "" "Locus" "%ABS_DIR%"
