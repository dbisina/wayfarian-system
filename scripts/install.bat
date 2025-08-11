@echo off
echo 📦 Installing Wayfarian dependencies...

echo Installing server dependencies...
cd server && npm install

echo Installing client dependencies...
cd ..\client && npm install

echo ✅ All dependencies installed!
echo Next: Copy .env.example to .env and configure your environment variables
