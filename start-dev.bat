@echo off
set BASE=%~dp0

echo Starting SwarmVision services...

start "event-relay :3001" cmd /k "cd /d "%BASE%services\event-relay" && npx ts-node src/index.ts"
timeout /t 2 /nobreak >nul

start "replay-service :3002" cmd /k "cd /d "%BASE%services\replay-service" && npx ts-node src/index.ts"
timeout /t 2 /nobreak >nul

start "intelligence-service :3004" cmd /k "cd /d "%BASE%services\intelligence-service" && npx ts-node src/index.ts"
timeout /t 2 /nobreak >nul

start "frontend :5173" cmd /k "cd /d "%BASE%apps\frontend" && npx vite"

echo.
echo All services launching in separate windows:
echo   event-relay        http://localhost:3001
echo   replay-service     http://localhost:3002
echo   intelligence-service http://localhost:3004
echo   frontend           http://localhost:5173
echo.
pause
