@echo off
cd /d %~dp0
title Alfa MP Master Server
chcp 65001 >nul

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

REM Fixed dev API key для удобства разработки (в production будет настоящая ротация)
set DEV_API_KEY=alfa_dev_owner_local
REM Подсадить демо-серверы при старте
set DEV_SEED=true

echo.
echo ================================================
echo   Alfa MP Master Server
echo   Open http://localhost:8080 in your browser
echo   Admin dashboard: http://localhost:8080/admin
echo   API docs:        http://localhost:8080/v1/docs
echo   Press Ctrl+C to stop
echo ================================================
echo.
call npm run dev
pause
