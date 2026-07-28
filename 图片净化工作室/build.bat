@echo off
REM ImageCleaner packager. Keep this .bat pure ASCII on command lines:
REM cmd.exe mis-tokenizes lines that contain UTF-8 multibyte (Chinese) chars,
REM which splits the pyinstaller command and causes 'noconfirm not recognized'.
cd /d "%~dp0"

echo [1/3] installing build deps...
python -m pip install --quiet pyinstaller customtkinter tkinterdnd2 Pillow

echo [2/3] cleaning old build...
if exist "build" rmdir /s /q "build"
if exist "dist" rmdir /s /q "dist"

echo [3/3] building (first run is slow)...
pyinstaller --noconfirm --onefile --windowed --name ImageCleaner --collect-all customtkinter --collect-all tkinterdnd2 --collect-all PIL main.py

echo.
if exist "dist\ImageCleaner.exe" (
  echo [OK] Build done. EXE at:
  echo      "%CD%\dist\ImageCleaner.exe"
) else (
  echo [FAIL] no exe in dist. Please copy the error above.
)
pause
