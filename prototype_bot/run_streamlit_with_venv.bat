@echo off
echo Starting HTML Prototype Bot on port 8501 with external access...

REM Activate the virtual environment
call "%~dp0prototype_env\Scripts\activate.bat"

REM Run Streamlit with server settings to allow external access
python -m streamlit run "%~dp0html_prototype_bot.py" --server.address=10.4.74.143 --server.port=8501

REM Keep the script running
pause
