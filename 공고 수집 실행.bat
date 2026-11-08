@echo off
rem Double-click to collect support program notices and open the latest report.
cd /d "%~dp0"
for /d %%D in (*) do if exist "%%D\crawl.py" cd /d "%%D"
if not exist crawl.py (echo crawl.py not found & pause & exit /b 1)
if "%~1"=="--check" (echo PATH_OK & dir /b crawl.py & exit /b 0)
set PY=C:\Users\49s49\AppData\Local\Programs\Python\Python311\python.exe
"%PY%" -I crawl.py
if errorlevel 1 (echo. & echo ERROR - see crawl_log.txt in the results folder & pause & exit /b 1)
"%PY%" -I build_report.py --open
pause