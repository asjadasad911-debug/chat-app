@echo off
echo ================================
echo Pushing Updated Code to GitHub
echo ================================
echo.

cd "C:\Users\HP\learning git\chat-app"

echo Adding all changes...
git add .

echo Creating commit...
git commit -m "Fixed Firebase permissions and user loading - Final" --allow-empty

echo Pushing to GitHub (you may need to enter credentials)...
git push origin master:main --force

echo.
echo ================================
echo DONE!
echo.
echo Now wait 3-5 minutes for GitHub Pages to rebuild
echo Then visit: https://asjadasad911-debug.github.io/chat-app/
echo ================================
echo.
pause
