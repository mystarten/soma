@echo off
title Soma
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto nonode

if exist node_modules goto run
echo.
echo  Premiere fois : installation, ca prend 1 a 2 minutes...
call npm install --no-audit --no-fund
if errorlevel 1 goto installfail

:run
echo.
echo  Soma demarre. Ne ferme pas cette fenetre tant que tu utilises l'app.
echo  Adresse : http://localhost:5173/soma/
echo.
start "" cmd /c "timeout /t 6 >nul & start http://localhost:5173/soma/"
call npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
echo.
echo  Le serveur s'est arrete. Si tu vois une erreur ci-dessus, copie-la.
pause
exit /b 0

:nonode
echo.
echo  Node.js n'est pas installe sur ce PC.
echo  Une page web va s'ouvrir : clique sur le bouton vert LTS,
echo  installe-le en cliquant sur Suivant partout,
echo  puis re-double-clique sur ce fichier.
echo.
start "" https://nodejs.org
pause
exit /b 1

:installfail
echo.
echo  L'installation a echoue. Verifie ta connexion internet.
pause
exit /b 1
