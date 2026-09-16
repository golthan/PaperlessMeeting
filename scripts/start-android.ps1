# Chạy app mobile trên Android Emulator (mở PowerShell tại thư mục gốc dự án rồi chạy:
#   .\scripts\start-android.ps1
# Yêu cầu: đã chạy backend ở terminal khác (npm run dev:backend).

$ErrorActionPreference = "Stop"

$sdk = "$env:LOCALAPPDATA\Android\Sdk"
if ($env:ANDROID_HOME) { $sdk = $env:ANDROID_HOME }
$adb = "$sdk\platform-tools\adb.exe"
$emulator = "$sdk\emulator\emulator.exe"

if (-not (Test-Path $emulator)) {
  Write-Host "Không tìm thấy Android SDK ở $sdk" -ForegroundColor Red
  exit 1
}

# Tên AVD: lấy từ biến môi trường AVD_NAME nếu có, không thì tự lấy AVD đầu tiên
# đang cài trên máy. Tránh hardcode vì mỗi máy đặt tên AVD một kiểu.
$avdName = $env:AVD_NAME
if (-not $avdName) {
  $avdName = & $emulator -list-avds | Where-Object { $_.Trim() } | Select-Object -First 1
}
if (-not $avdName) {
  Write-Host "Chưa có AVD nào. Mở Android Studio > Device Manager để tạo một máy ảo." -ForegroundColor Red
  exit 1
}

# 1. Bật emulator nếu chưa chạy
$devices = & $adb devices | Select-String "emulator-\d+\s+device"
if (-not $devices) {
  Write-Host "Đang khởi động emulator $avdName..." -ForegroundColor Cyan
  Start-Process -FilePath $emulator -ArgumentList '-avd', $avdName, '-no-boot-anim'
  Write-Host "Chờ emulator boot xong (có thể mất 1-2 phút)..."
  $deadline = (Get-Date).AddMinutes(4)
  while ((Get-Date) -lt $deadline) {
    $boot = (& $adb shell getprop sys.boot_completed 2>$null)
    if ("$boot".Trim() -eq "1") { break }
    Start-Sleep -Seconds 5
  }
  if ("$boot".Trim() -ne "1") {
    Write-Host "Emulator chưa boot xong, thử lại sau." -ForegroundColor Red
    exit 1
  }
}
Write-Host "Emulator đã sẵn sàng ($avdName)." -ForegroundColor Green

# 2. Chạy Expo. 10.0.2.2 là địa chỉ máy host nhìn từ trong emulator —
#    bắt buộc để Expo Go tải được JS bundle và app gọi được API backend.
$env:REACT_NATIVE_PACKAGER_HOSTNAME = "10.0.2.2"
Set-Location "$PSScriptRoot\..\mobile"
npx expo start --android
