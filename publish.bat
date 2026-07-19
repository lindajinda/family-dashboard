@echo off
REM ============================================================
REM  Publish the family dashboard to the live website.
REM  Just double-click this file. It saves your changes to
REM  GitHub, which updates the live site for everyone.
REM  Live site: https://lindajinda.github.io/family-dashboard/
REM ============================================================

cd /d "%~dp0"

echo.
echo   Publishing the family dashboard...
echo.

REM --- Ask for an optional note about what changed ---
set "msg="
set /p "msg=  What changed? (press Enter to skip): "
if "%msg%"=="" set "msg=Update dashboard"

REM --- Save and upload the changes ---
git add -A
git commit -m "%msg%"

if errorlevel 1 (
  echo.
  echo   Nothing new to publish - the live site is already up to date.
  echo.
  echo   Press any key to close.
  pause >nul
  exit /b 0
)

git push

if errorlevel 1 (
  echo.
  echo   ============================================================
  echo   Something went wrong while uploading to GitHub.
  echo   The changes ARE saved on this computer, just not published
  echo   yet. Check your internet connection and try again, or ask
  echo   Claude for help. Copy any red text above.
  echo   ============================================================
  echo.
  echo   Press any key to close.
  pause >nul
  exit /b 1
)

echo.
echo   ============================================================
echo   Done! Give it about a minute, then reload:
echo   https://lindajinda.github.io/family-dashboard/
echo   Everyone with the link now sees the updated version.
echo   ============================================================
echo.
echo   Press any key to close.
pause >nul
