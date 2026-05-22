@echo off
cd /d %~dp0
title Alfa MP Master Server

if not exist node_modules (
    echo.
    echo === First run: installing dependencies ===
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo ERROR: npm install failed. Make sure Node.js is installed: https://nodejs.org/
        pause
        exit /b 1
    )
    echo.
)

echo Starting Alfa MP Master Server...
echo Open http://localhost:8080 in your browser
echo Press Ctrl+C to stop
echo.
call npm run dev
pause
