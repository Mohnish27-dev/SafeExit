@echo off
set "PATH=%PATH%;C:\Program Files\nodejs\"
echo Starting SafeExit Backend Server...
echo Backend API will run on http://localhost:5000
npm run dev:backend
pause
