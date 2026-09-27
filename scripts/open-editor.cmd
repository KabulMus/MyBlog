@echo off
rem Blog editor launcher: start the dev server if it is not up yet, then open /admin.
rem   - the server runs in a MINIMIZED console window titled "Blog editor - dev server"
rem   - closing that window stops the server (so does: npx astro dev stop)
rem   - run with --no-open to only start the server, without opening the browser
rem NOTE: keep this file pure ASCII. cmd.exe parses .cmd files with the console
rem   codepage (GBK on this machine), so UTF-8 Chinese comments get split apart and
rem   the tail of the line is run as a command ("is not recognized as an internal
rem   or external command" for every fragment).

setlocal
cd /d "%~dp0.."
set "ROOT=%CD%"

curl.exe -s -o NUL --max-time 2 http://localhost:4321/admin
if not errorlevel 1 goto open

echo Starting dev server, waiting for it to come up...
rem /d sets the working directory, so no nested quoting inside cmd /c is needed
start "Blog editor - dev server" /min /d "%ROOT%" cmd /c "npm run dev"

rem wait until the port answers (max 60s);
rem ping is used as sleep because timeout errors out when stdin is redirected
set /a tries=0
:wait
curl.exe -s -o NUL --max-time 2 http://localhost:4321/admin
if not errorlevel 1 goto open
set /a tries+=1
if %tries% GEQ 60 goto timeout
ping -n 2 127.0.0.1 >nul
goto wait

:open
if /i "%~1"=="--no-open" exit /b 0
start "" http://localhost:4321/admin
exit /b 0

:timeout
echo Dev server did not come up within 60s. Check the minimized window for errors.
pause
exit /b 1
