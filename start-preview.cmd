@echo off
setlocal
cd /d "%~dp0"
set "GAME_NODE="
for /f "delims=" %%N in ('where node.exe 2^>nul') do if not defined GAME_NODE set "GAME_NODE=%%N"
if not defined GAME_NODE if exist "%ProgramFiles%\nodejs\node.exe" set "GAME_NODE=%ProgramFiles%\nodejs\node.exe"
if not defined GAME_NODE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "GAME_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not defined GAME_NODE (
  echo Node.js was not found. Install Node.js LTS from https://nodejs.org/en/download
  pause
  exit /b 1
)
if not exist "node_modules\@electric-sql\pglite\package.json" (
  echo Dependencies are missing. Install Node.js LTS, reopen PowerShell, and run: npm.cmd ci
  pause
  exit /b 1
)
echo Starting local preview. Open http://127.0.0.1:3000
echo Preview data is temporary. Keep this window open. Press Ctrl+C to stop.
"%GAME_NODE%" scripts\preview.js
if errorlevel 1 pause
