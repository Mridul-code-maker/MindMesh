@echo off
set PATH=C:\Users\Hp\.gemini\antigravity\scratch\.node\node-v20.11.1-win-x64;%PATH%

echo ====================================================
echo   MindMesh Local Workspace Auto-Launcher
echo ====================================================
echo.
echo Starting Express Backend & Websocket server...
start "MindMesh Backend Engine (Port 5000)" cmd.exe /k "cd backend && npm run dev"

echo Starting Next.js UI Dev server...
start "MindMesh Frontend UI Client (Port 3000)" cmd.exe /k "cd frontend && npm run dev"

echo.
echo ====================================================
echo [SUCCESS] Both backend and frontend servers launched!
echo Keep both terminal windows open during your presentation.
echo Open http://localhost:3000 in your browser.
echo ====================================================
echo.
pause
