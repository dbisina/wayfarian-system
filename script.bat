@echo off
REM Wayfarian App - Project Structure Generator (Windows)
REM This script creates the complete folder structure and basic files for the Wayfarian travel app

echo 🚀 Setting up Wayfarian App project structure...
echo ================================================

REM Create root project directory
set PROJECT_ROOT=wayfarian-app
if not exist "%PROJECT_ROOT%" mkdir "%PROJECT_ROOT%"
cd "%PROJECT_ROOT%"

echo.
echo 🏗️  Creating server structure...

REM Server directories
mkdir server 2>nul
mkdir server\controllers 2>nul
mkdir server\routes 2>nul
mkdir server\sockets 2>nul
mkdir server\services 2>nul
mkdir server\middleware 2>nul
mkdir server\utils 2>nul
mkdir server\prisma 2>nul
mkdir server\prisma\migrations 2>nul
mkdir server\tests 2>nul
mkdir server\uploads 2>nul

echo.
echo 📱 Creating client structure...

REM Client directories
mkdir client 2>nul
mkdir client\screens 2>nul
mkdir client\screens\auth 2>nul
mkdir client\screens\journey 2>nul
mkdir client\screens\gallery 2>nul
mkdir client\screens\group 2>nul
mkdir client\screens\leaderboard 2>nul
mkdir client\screens\map 2>nul
mkdir client\screens\profile 2>nul
mkdir client\components 2>nul
mkdir client\components\common 2>nul
mkdir client\components\journey 2>nul
mkdir client\components\gallery 2>nul
mkdir client\components\map 2>nul
mkdir client\components\ui 2>nul
mkdir client\context 2>nul
mkdir client\services 2>nul
mkdir client\utils 2>nul
mkdir client\assets 2>nul
mkdir client\assets\images 2>nul
mkdir client\assets\icons 2>nul
mkdir client\assets\fonts 2>nul
mkdir client\hooks 2>nul
mkdir client\navigation 2>nul
mkdir client\constants 2>nul

echo.
echo 📋 Creating logs and documentation...

REM Logs and documentation
mkdir logs 2>nul
mkdir docs 2>nul
mkdir scripts 2>nul

echo.
echo 📄 Creating configuration files...

REM Create README.md
(
echo # Wayfarian - Journey-Focused Travel App
echo.
echo A mobile application for tracking personal vehicle journeys with real-time GPS tracking, group journey sharing, and photo documentation.
echo.
echo ## Features
echo - 📍 GPS Journey Tracking
echo - 🧑‍🤝‍🧑 Group Journey Mode
echo - 🖼️ Photo Gallery
echo - 🏆 Leaderboard
echo - 🗺️ Maps ^& Nearby Places
echo.
echo ## Getting Started
echo.
echo ### Prerequisites
echo - Node.js 18+
echo - PostgreSQL
echo - Firebase Account
echo - Expo CLI
echo.
echo ### Installation
echo 1. Clone the repository
echo 2. Install server dependencies: `cd server ^&^& npm install`
echo 3. Install client dependencies: `cd client ^&^& npm install`
echo 4. Set up environment variables ^(see .env.example^)
echo 5. Run database migrations: `npm run db:migrate`
echo 6. Start the development servers
echo.
echo ## Project Structure
echo - `/server` - Express.js backend API
echo - `/client` - React Native mobile app
echo - `/logs` - Development progress logs
echo - `/docs` - Documentation
echo.
echo ## License
echo MIT
) > README.md

REM Create .gitignore
(
echo # Dependencies
echo node_modules/
echo */node_modules/
echo.
echo # Environment variables
echo .env
echo .env.local
echo .env.development.local
echo .env.test.local
echo .env.production.local
echo.
echo # Database
echo *.db
echo *.sqlite
echo.
echo # Logs
echo logs/
echo *.log
echo npm-debug.log*
echo yarn-debug.log*
echo yarn-error.log*
echo.
echo # OS generated files
echo .DS_Store
echo .DS_Store?
echo ._*
echo .Spotlight-V100
echo .Trashes
echo ehthumbs.db
echo Thumbs.db
echo.
echo # IDE
echo .vscode/
echo .idea/
echo *.swp
echo *.swo
echo.
echo # Build outputs
echo build/
echo dist/
echo */build/
echo */dist/
echo.
echo # Expo
echo .expo/
echo .expo-shared/
echo.
echo # React Native
echo *.jks
echo *.p8
echo *.p12
echo *.key
echo *.mobileprovision
echo *.orig.*
echo web-build/
echo.
echo # Firebase
echo firebase-debug.log
echo .firebase/
echo.
echo # Prisma
echo prisma/migrations/dev.db*
echo.
echo # Uploads
echo server/uploads/*
echo !server/uploads/.gitkeep
echo.
echo # Coverage
echo coverage/
echo *.lcov
) > .gitignore

REM Create .env.example
(
echo # Database
echo DATABASE_URL="postgresql://username:password@localhost:5432/wayfarian"
echo.
echo # Firebase Configuration ^(Server^)
echo FIREBASE_PROJECT_ID="your-project-id"
echo FIREBASE_CLIENT_EMAIL="your-service-account@your-project.iam.gserviceaccount.com"
echo FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour-Private-Key\n-----END PRIVATE KEY-----\n"
echo FIREBASE_STORAGE_BUCKET="your-project.appspot.com"
echo.
echo # Firebase Configuration ^(Client^)
echo FIREBASE_API_KEY="your-api-key"
echo FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
echo FIREBASE_MESSAGING_SENDER_ID="123456789"
echo FIREBASE_APP_ID="1:123456789:web:abcdef123456"
echo.
echo # Expo Configuration ^(Client^)
echo EXPO_PUBLIC_API_URL="http://localhost:3001/api"
echo EXPO_PUBLIC_SOCKET_URL="http://localhost:3001"
echo.
echo # Maps Integration
echo GOOGLE_MAPS_API_KEY="your-google-maps-api-key"
echo MAPBOX_ACCESS_TOKEN="your-mapbox-token"
echo.
echo # Server Configuration
echo PORT=3001
echo NODE_ENV="development"
echo FRONTEND_URL="http://localhost:19006"
echo.
echo # Security
echo JWT_SECRET="your-jwt-secret"
echo RATE_LIMIT_WINDOW_MS=900000
echo RATE_LIMIT_MAX_REQUESTS=100
echo.
echo # Logging
echo LOG_LEVEL="info"
) > .env.example

echo.
echo 🔧 Creating server files...

REM Server package.json
(
echo {
echo   "name": "wayfarian-server",
echo   "version": "1.0.0",
echo   "description": "Backend API for Wayfarian App - Journey-focused travel tracking",
echo   "main": "index.js",
echo   "scripts": {
echo     "dev": "nodemon index.js",
echo     "start": "node index.js",
echo     "db:generate": "prisma generate",
echo     "db:migrate": "prisma migrate dev",
echo     "db:deploy": "prisma migrate deploy",
echo     "db:studio": "prisma studio",
echo     "db:seed": "node prisma/seed.js",
echo     "test": "jest",
echo     "test:watch": "jest --watch",
echo     "lint": "eslint .",
echo     "lint:fix": "eslint . --fix"
echo   },
echo   "keywords": ["travel", "journey", "gps", "tracking", "express", "socket.io", "firebase"],
echo   "author": "Wayfarian Team",
echo   "license": "MIT",
echo   "dependencies": {},
echo   "devDependencies": {},
echo   "engines": {
echo     "node": "^>=18.0.0",
echo     "npm": "^>=8.0.0"
echo   }
echo }
) > server\package.json

REM Server index.js
(
echo // Wayfarian Server Entry Point
echo const app = require^('./app'^);
echo const http = require^('http'^);
echo.
echo const PORT = process.env.PORT ^|^| 3001;
echo const server = http.createServer^(app^);
echo.
echo server.listen^(PORT, ^(^) =^> {
echo   console.log^(`🚀 Wayfarian API Server running on port ${PORT}`^);
echo }^);
echo.
echo module.exports = { app, server };
) > server\index.js

REM Server app.js
(
echo // Wayfarian Express App Configuration
echo const express = require^('express'^);
echo require^('dotenv'^).config^(^);
echo.
echo const app = express^(^);
echo.
echo // Middleware
echo app.use^(express.json^(^)^);
echo.
echo // Health check
echo app.get^('/health', ^(req, res^) =^> {
echo   res.json^({ 
echo     status: 'OK', 
echo     service: 'Wayfarian API',
echo     timestamp: new Date^(^).toISOString^(^)
echo   }^);
echo }^);
echo.
echo module.exports = app;
) > server\app.js

REM Prisma schema
(
echo // Wayfarian Database Schema
echo generator client {
echo   provider = "prisma-client-js"
echo }
echo.
echo datasource db {
echo   provider = "postgresql"
echo   url      = env^("DATABASE_URL"^)
echo }
echo.
echo // Add your models here
) > server\prisma\schema.prisma

echo.
echo 📱 Creating client files...

REM Client package.json
(
echo {
echo   "name": "wayfarian-client",
echo   "version": "1.0.0",
echo   "description": "React Native mobile app for Wayfarian - Journey tracking",
echo   "main": "node_modules/expo/AppEntry.js",
echo   "scripts": {
echo     "start": "expo start",
echo     "android": "expo start --android",
echo     "ios": "expo start --ios",
echo     "web": "expo start --web",
echo     "build:android": "expo build:android",
echo     "build:ios": "expo build:ios",
echo     "eject": "expo eject",
echo     "test": "jest",
echo     "lint": "eslint .",
echo     "lint:fix": "eslint . --fix"
echo   },
echo   "keywords": ["react-native", "expo", "travel", "journey", "gps", "mobile"],
echo   "author": "Wayfarian Team",
echo   "license": "MIT",
echo   "dependencies": {},
echo   "devDependencies": {},
echo   "private": true,
echo   "engines": {
echo     "node": "^>=18.0.0",
echo     "npm": "^>=8.0.0"
echo   }
echo }
) > client\package.json

REM Client App.js
(
echo // Wayfarian Mobile App Entry Point
echo import React from 'react';
echo import { Text, View, StyleSheet } from 'react-native';
echo.
echo export default function App^(^) {
echo   return ^(
echo     ^<View style={styles.container}^>
echo       ^<Text style={styles.title}^>Wayfarian^</Text^>
echo       ^<Text style={styles.subtitle}^>Journey-Focused Travel App^</Text^>
echo     ^</View^>
echo   ^);
echo }
echo.
echo const styles = StyleSheet.create^({
echo   container: {
echo     flex: 1,
echo     backgroundColor: '#fff',
echo     alignItems: 'center',
echo     justifyContent: 'center',
echo   },
echo   title: {
echo     fontSize: 32,
echo     fontWeight: 'bold',
echo     marginBottom: 8,
echo   },
echo   subtitle: {
echo     fontSize: 16,
echo     color: '#666',
echo   },
echo }^);
) > client\App.js

REM Expo app.json
(
echo {
echo   "expo": {
echo     "name": "Wayfarian",
echo     "slug": "wayfarian",
echo     "version": "1.0.0",
echo     "orientation": "portrait",
echo     "icon": "./assets/icon.png",
echo     "userInterfaceStyle": "light",
echo     "splash": {
echo       "image": "./assets/splash.png",
echo       "resizeMode": "contain",
echo       "backgroundColor": "#ffffff"
echo     },
echo     "assetBundlePatterns": [
echo       "**/*"
echo     ],
echo     "ios": {
echo       "supportsTablet": true
echo     },
echo     "android": {
echo       "adaptiveIcon": {
echo         "foregroundImage": "./assets/adaptive-icon.png",
echo         "backgroundColor": "#FFFFFF"
echo       }
echo     },
echo     "web": {
echo       "favicon": "./assets/favicon.png"
echo     }
echo   }
echo }
) > client\app.json

echo.
echo 📊 Creating log files...

REM Initial iteration log
(
echo # Wayfarian App - Development Log
echo.
echo ## 📋 Project Setup - Initial Structure
echo **Date**: %date%  
echo **Phase**: Structure Generation
echo.
echo ---
echo.
echo ## ✅ What Was Accomplished
echo.
echo ### 🏗️ Project Structure Created
echo - ✅ **Complete folder hierarchy established**
echo - ✅ **Server structure with all required directories**
echo - ✅ **Client structure with organized components**
echo - ✅ **Configuration files generated**
echo - ✅ **Package.json templates created**
echo - ✅ **Environment configuration template**
echo.
echo ### 📁 Directory Structure Summary
echo - `server/` - Backend API ^(Express.js^)
echo - `client/` - Mobile app ^(React Native + Expo^)
echo - `logs/` - Development progress tracking
echo - `docs/` - Documentation
echo - `scripts/` - Utility scripts
echo.
echo ---
echo.
echo ## 🎯 Next Steps
echo.
echo 1. Install dependencies ^(`npm install` in both server and client^)
echo 2. Set up environment variables
echo 3. Initialize database with Prisma
echo 4. Start implementing core features
echo 5. Set up Firebase configuration
echo.
echo ---
echo.
echo *Project structure generated automatically using setup script.*
) > logs\iteration-log.md

REM Task status JSON
(
echo {
echo   "project": "Wayfarian App - Phase 1",
echo   "lastUpdated": "%date%T%time%Z",
echo   "phase": "setup",
echo   "status": "structure_created",
echo   "progress": "5%%",
echo   "nextSteps": [
echo     "Install dependencies",
echo     "Configure environment variables",
echo     "Set up database",
echo     "Implement authentication",
echo     "Build core features"
echo   ]
echo }
) > logs\task-status.json

echo.
echo 🛠️  Creating utility scripts...

REM Install script
(
echo @echo off
echo echo 📦 Installing Wayfarian dependencies...
echo.
echo echo Installing server dependencies...
echo cd server ^&^& npm install
echo.
echo echo Installing client dependencies...
echo cd ..\client ^&^& npm install
echo.
echo echo ✅ All dependencies installed!
echo echo Next: Copy .env.example to .env and configure your environment variables
) > scripts\install.bat

REM Create gitkeep files
echo. > server\uploads\.gitkeep
echo. > docs\.gitkeep

echo.
echo 🎉 Wayfarian project structure created successfully!
echo.
echo 📋 Summary:
echo ├── Root directory: %PROJECT_ROOT%\
echo ├── Server structure: ✅ Complete
echo ├── Client structure: ✅ Complete
echo ├── Configuration files: ✅ Created
echo ├── Documentation: ✅ Initialized
echo └── Utility scripts: ✅ Ready
echo.
echo 🚀 Next Steps:
echo 1. cd %PROJECT_ROOT%
echo 2. copy .env.example .env (and configure)
echo 3. scripts\install.bat (install dependencies)
echo 4. Set up your database and Firebase
echo 5. Start development servers
echo.
echo Happy coding! 🚗💨
pause