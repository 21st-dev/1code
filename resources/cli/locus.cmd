@echo off
set "DIR=%~1"
if "%DIR%"=="" set "DIR=%CD%"

for %%I in ("%DIR%") do set "ABS_DIR=%%~fI"

if not exist "%ABS_DIR%\" (
  echo Error: Invalid directory
  exit /b 1
)

start "" "Locus" "%ABS_DIR%"
