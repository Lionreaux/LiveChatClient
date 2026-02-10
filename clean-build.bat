@echo off
echo Nettoyage complet avant build...

REM Tuer les processus Electron
taskkill /F /IM "ChatDiscord Client.exe" /T 2>nul
taskkill /F /IM electron.exe /T 2>nul

REM Supprimer les dossiers de build
if exist dist rmdir /s /q dist
if exist node_modules\.cache rmdir /s /q node_modules\.cache

echo Nettoyage termine !
echo.
echo Lancez maintenant: npm run build
pause
