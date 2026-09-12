@echo off
REM ==========================================================================
REM  Dubbelklik dit bestand om de kaart bij te werken.
REM
REM  Het start scripts\bijwerken.py en houdt het venster daarna open, zodat je
REM  kunt lezen wat er gebeurd is. Meer hoef je niet te doen.
REM ==========================================================================
cd /d "%~dp0"
chcp 65001 >nul

where py >nul 2>nul
if errorlevel 1 goto geen_python

py scripts\bijwerken.py %*
echo.
echo ==========================================================================
echo  Klaar. Lees hierboven wat er gebeurd is. Dit venster mag je nu sluiten.
echo ==========================================================================
pause
exit /b

:geen_python
echo.
echo  Python staat niet op deze computer.
echo.
echo  Haal het op https://www.python.org/downloads/ en vink tijdens het
echo  installeren "Add python.exe to PATH" aan. Dubbelklik dit bestand daarna
echo  opnieuw.
echo.
pause
exit /b 1
