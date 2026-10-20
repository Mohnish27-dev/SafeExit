@echo off
set "PATH=%PATH%;C:\Program Files\nodejs\"
echo ===================================================
echo Starting SafeExit Full Stack (Frontend + Backend)...
echo Frontend: http://localhost:3000/safeexit
echo Backend:  http://localhost:5000
echo ===================================================
npm run dev
pause
