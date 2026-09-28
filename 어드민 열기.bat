@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo 처음 실행: 필요한 파일을 설치합니다...
  call npm install
)
echo 어드민을 여는 중... 이 창을 닫으면 어드민도 꺼집니다.
call npm run admin
