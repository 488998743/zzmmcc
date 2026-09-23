@echo off
rem ---------------------------------------------------------------------------
rem  恐龙找物 · 网页版 —— 本地静态服务
rem  双击我就能跑；窗口别关，关了服务就停了。
rem  端口默认 8080，想换端口就在命令行里带一个：start-server.bat 8090
rem ---------------------------------------------------------------------------
cd /d "%~dp0"
set PORT=%1
if "%PORT%"=="" set PORT=8080

title dino-findgame server (port %PORT%)
echo.
echo   目录: %CD%
echo   本机: http://127.0.0.1:%PORT%/
echo   手机(同一 Wi-Fi): http://本机内网IP:%PORT%/
echo   停止: 关掉这个窗口, 或者按 Ctrl+C
echo.
python -m http.server %PORT% --bind 0.0.0.0
echo.
echo [已停止] 如果上面写着 "Address already in use", 说明这个端口被别的程序占了,
echo          换个端口再试:  start-server.bat 8090
pause
