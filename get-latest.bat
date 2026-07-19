@echo off
REM ============================================================
REM  Get the latest version of the family dashboard.
REM  Just double-click this file. It downloads the newest
REM  version from GitHub onto this computer.
REM
REM  Use this when you've been editing on another computer,
REM  or before you start making changes here, so you always
REM  begin from the newest version.
REM ============================================================

cd /d "%~dp0"

echo.
echo   Getting the latest version from GitHub...
echo.

git pull

if errorlevel 1 (
  echo.
  echo   ============================================================
  echo   Couldn't get the latest version cleanly.
  echo   This usually means you have unpublished changes on THIS
  echo   computer. Fix: run  publish.bat  first to save them,
  echo   then run  get-latest.bat  again.
  echo   If it still fails, copy any red text above and ask Claude.
  echo   ============================================================
  echo.
  echo   Press any key to close.
  pause >nul
  exit /b 1
)

echo.
echo   ============================================================
echo   Done! This computer now has the newest version.
echo   ============================================================
echo.
echo   Press any key to close.
pause >nul
