# Bật toàn bộ hệ thống để demo bằng MỘT lệnh:
#   npm run demo
#
# Database + LiveKit + Adminer (Docker), backend, web, emulator kèm app mobile,
# rồi mở sẵn trang web và trang xem database trên trình duyệt. Không reset hay
# seed dữ liệu: mọi thứ đang có trong database giữ nguyên.

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib.ps1"

Start-Infra -Extra @("adminer")
Start-Backend
Start-Frontend
Start-Emulator

if (-not (Test-Path $script:Apk)) {
  Write-Warn "Chưa có APK, build lần đầu (10-20 phút)..."
  & "$PSScriptRoot\build-android.ps1" -NoLaunch
}
Install-App
Start-App

Start-Process "http://localhost:5173"
Start-Process "http://localhost:8080"

Write-Host ""
Write-Host "Sẵn sàng demo:" -ForegroundColor Green
Write-Host "  Web:          http://localhost:5173   (organizer@example.com / 123456)"
Write-Host "  App emulator: participant1@example.com / 123456"
Write-Host "  Database:     http://localhost:8080   (Adminer, tự đăng nhập)"
Write-Host "  ERD:          npm run db:view         (mở thêm pgAdmin)"
