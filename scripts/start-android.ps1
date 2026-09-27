# Chạy app mobile (bản có video native) trên Android Emulator:
#   npm run android:emu
#
# Tự làm hết: bật Docker (database + LiveKit với đúng IP cho emulator), bật
# backend nếu chưa chạy, bật emulator, nối micro laptop vào emulator, cài APK,
# cấp sẵn quyền micro/camera rồi mở app. Chưa có APK thì tự build lần đầu.
# Chạy lại lệnh này bao nhiêu lần cũng được, bước nào xong rồi sẽ bỏ qua.

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib.ps1"

Start-Infra
Start-Backend
Start-Emulator

if (-not (Test-Path $script:Apk)) {
  Write-Warn "Chưa có APK, build lần đầu (10-20 phút)..."
  & "$PSScriptRoot\build-android.ps1" -NoLaunch
}
Install-App
Start-App

Write-Host ""
Write-Host "Đăng nhập app bằng participant1@example.com / 123456 (hoặc tài khoản đã tạo)." -ForegroundColor Green
Write-Host "Sửa code mobile xong thì chạy: npm run android:build (build lại và mở app)." -ForegroundColor Green
