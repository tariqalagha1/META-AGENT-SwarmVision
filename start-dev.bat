@echo off
set BASE=%~dp0

echo Starting SwarmVision services...

start "backend :8012" cmd /k "cd /d "%BASE%apps\backend" && C:\Users\admin\AppData\Local\Programs\Python\Python311\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8012"
timeout /t 2 /nobreak >nul

start "event-relay :3001" cmd /k "cd /d "%BASE%services\event-relay" && npx ts-node src/index.ts"
timeout /t 2 /nobreak >nul

start "replay-service :3002" cmd /k "cd /d "%BASE%services\replay-service" && npx ts-node src/index.ts"
timeout /t 2 /nobreak >nul

start "intelligence-service :3004" cmd /k "cd /d "%BASE%services\intelligence-service" && npx ts-node src/index.ts"
timeout /t 2 /nobreak >nul

start "frontend :5173" cmd /k "cd /d "%BASE%apps\frontend" && npx vite --strictPort --port 5173"

echo.
echo All services launching in separate windows:
echo   backend            http://localhost:8012
echo   event-relay        http://localhost:3001
echo   replay-service     http://localhost:3002
echo   intelligence-service http://localhost:3004
echo   frontend           http://localhost:5173
echo.
pause
