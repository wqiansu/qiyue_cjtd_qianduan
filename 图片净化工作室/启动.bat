@echo off
chcp 65001 >nul
cd /d "%~dp0"
REM 直接用 Python 启动(免打包)。首次会自动装依赖。
python -c "import customtkinter,tkinterdnd2,PIL" 2>nul || python -m pip install -r requirements.txt
python main.py
