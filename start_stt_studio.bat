@echo off
chcp 65001 > nul
title AI 다국어 음성인식 스튜디오 실행기

cd /d "d:\antigravityhyunssttfile"

echo ===================================================
echo   AI 다국어 음성인식 스튜디오를 시작합니다...
echo   (백엔드: http://127.0.0.1:8000 / 프론트엔드: http://localhost:3000)
echo ===================================================

:: 1. Check if backend port 8000 is running, if not start it
netstat -ano | findstr ":8000 " > nul
if %errorlevel% neq 0 (
    echo [1/3] FastAPI 백엔드 서버 구동 중...
    start /b "" ".\venv\Scripts\python.exe" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
) else (
    echo [1/3] 백엔드 서버가 이미 작동 중입니다.
)

:: 2. Check if frontend port 3000 is running, if not start it
netstat -ano | findstr ":3000 " > nul
if %errorlevel% neq 0 (
    echo [2/3] 프론트엔드 웹 서버 구동 중...
    start /b "" cmd.exe /c "cd /d d:\antigravityhyunssttfile\frontend && npm run dev"
) else (
    echo [2/3] 프론트엔드 웹 서버가 이미 작동 중입니다.
)

:: 3. Wait 2 seconds and open Google Chrome
echo [3/3] Google Chrome으로 브라우저 실행 중...
timeout /t 2 /nobreak > nul

:: Try Chrome in common installation paths
set CHROME_PATH=
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    set CHROME_PATH="%ProgramFiles%\Google\Chrome\Application\chrome.exe"
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    set CHROME_PATH="%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
) else if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    set CHROME_PATH="%LocalAppData%\Google\Chrome\Application\chrome.exe"
)

if defined CHROME_PATH (
    start "" %CHROME_PATH% "http://localhost:3000"
) else (
    echo [경고] Chrome을 찾지 못했습니다. 기본 브라우저로 실행합니다.
    start "" "http://localhost:3000"
)

exit
