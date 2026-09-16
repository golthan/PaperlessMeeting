# Chạy app mobile trên Android Emulator (mở PowerShell tại thư mục gốc dự án rồi chạy:
#   npm run android:emu     hoặc     .\scripts\start-android.ps1
# Yêu cầu: đã chạy backend ở terminal khác (npm run dev:backend).

$ErrorActionPreference = "Stop"
# Windows PowerShell 5.1 mặc định không in được tiếng Việt ra terminal.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$sdk = "$env:LOCALAPPDATA\Android\Sdk"
if ($env:ANDROID_HOME) { $sdk = $env:ANDROID_HOME }
$adb = "$sdk\platform-tools\adb.exe"
$emulator = "$sdk\emulator\emulator.exe"

if (-not (Test-Path $emulator)) {
  Write-Host "Không tìm thấy Android SDK ở $sdk" -ForegroundColor Red
  exit 1
}

# Gọi adb mà KHÔNG để dòng cảnh báo trên stderr (vd "no devices/emulators found"
# lúc emulator đang khởi động) biến thành lỗi dừng script. Trên PowerShell 5.1,
# với ErrorActionPreference = Stop thì kể cả "2>$null" cũng bị coi là lỗi.
function Invoke-Adb {
  param([string[]]$Arguments)
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    return (& $adb @Arguments 2>$null)
  } catch {
    return $null
  } finally {
    $ErrorActionPreference = $previous
  }
}

function Test-EmulatorBooted {
  $boot = Invoke-Adb @("shell", "getprop", "sys.boot_completed")
  return ("$boot".Trim() -eq "1")
}

function Get-QemuProcess {
  return Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like 'qemu-system*' }
}

# Máy ảo được coi là đang chạy khi tiến trình qemu (máy ảo thật) còn sống hoặc adb
# thấy thiết bị emulator. Không dựa vào emulator.exe: tiến trình vỏ này có thể còn
# sót lại vài giây sau khi máy ảo đã tắt.
function Test-EmulatorAlive {
  if (Get-QemuProcess) { return $true }
  return [bool](Invoke-Adb @("devices") | Select-String "emulator-\d+")
}

# -no-snapshot-load: luôn khởi động sạch (cold boot), không nạp bản lưu Quick Boot.
# Bản lưu này dễ hỏng khi emulator bị tắt ngang; nạp phải bản hỏng thì Android đứng
# hình (đồng hồ đứng yên) và adb báo "offline" mãi, không bao giờ khởi động xong.
function Start-Emulator {
  Write-Host "Đang khởi động emulator $avdName..." -ForegroundColor Cyan
  Start-Process -FilePath $emulator -ArgumentList '-avd', $avdName, '-no-boot-anim', '-no-snapshot-load'
}

function Stop-Emulator {
  Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessName -like 'qemu-system*' -or $_.ProcessName -eq 'emulator' } |
    Stop-Process -Force -ErrorAction SilentlyContinue
  $until = (Get-Date).AddSeconds(20)
  while ((Get-QemuProcess) -and (Get-Date) -lt $until) { Start-Sleep -Milliseconds 500 }
}

# Tên AVD: lấy từ biến môi trường AVD_NAME nếu có, không thì lấy AVD đầu tiên
# đang cài trên máy. Tránh cố định tên vì mỗi máy đặt tên AVD một kiểu.
$avdName = $env:AVD_NAME
if (-not $avdName) {
  $avdName = & $emulator -list-avds | Where-Object { $_.Trim() } | Select-Object -First 1
}
if (-not $avdName) {
  Write-Host "Chưa có AVD nào. Mở Android Studio > Device Manager để tạo một máy ảo." -ForegroundColor Red
  exit 1
}

# 1. Bật emulator nếu chưa có máy nào đang chạy (kể cả đang khởi động dở).
$null = Invoke-Adb @("start-server")
$attached = Test-EmulatorAlive
if ($attached) {
  Write-Host "Emulator đã được bật, chờ khởi động xong..." -ForegroundColor Cyan
} else {
  Start-Emulator
}
$launchedAt = Get-Date
$retried = $false

# 2. Chờ Android khởi động xong (tối đa 5 phút).
if (-not (Test-EmulatorBooted)) {
  Write-Host "Chờ emulator khởi động xong (thường mất 1-2 phút)" -NoNewline
  $deadline = (Get-Date).AddMinutes(5)
  while (-not (Test-EmulatorBooted)) {
    if ((Get-Date) -gt $deadline) {
      Write-Host ""
      Write-Host "Emulator chưa khởi động xong sau 5 phút. Tắt hẳn cửa sổ emulator rồi chạy lại lệnh này." -ForegroundColor Red
      exit 1
    }
    $waited = ((Get-Date) - $launchedAt).TotalSeconds
    if (-not $retried -and $attached -and $waited -gt 60) {
      # Emulator bật sẵn từ trước (Android Studio, VS Code...) đã chạy hơn 2 phút mà chờ
      # thêm 1 phút vẫn không dùng được: gần như chắc chắn đang treo do nạp bản lưu
      # Quick Boot hỏng. Tắt đi và khởi động sạch.
      $qemu = Get-QemuProcess | Select-Object -First 1
      if ($qemu -and ((Get-Date) - $qemu.StartTime).TotalSeconds -gt 120) {
        Write-Host ""
        Write-Host "Emulator đang bật nhưng bị treo (thường do bản lưu Quick Boot bị hỏng), khởi động lại sạch..." -ForegroundColor Yellow
        Stop-Emulator
        Start-Emulator
        $retried = $true
        $launchedAt = Get-Date
        $deadline = (Get-Date).AddMinutes(5)
        Write-Host "Chờ emulator khởi động xong (thường mất 1-2 phút)" -NoNewline
      }
    } elseif (-not $retried -and -not $attached -and $waited -gt 30 -and -not (Test-EmulatorAlive)) {
      # Sau 30 giây vẫn không có máy ảo nào (vd máy ảo cũ vừa tắt dở) thì bật lại một lần.
      Write-Host ""
      Start-Emulator
      $retried = $true
    }
    Write-Host "." -NoNewline
    Start-Sleep -Seconds 3
  }
  Write-Host ""
}
Write-Host "Emulator đã sẵn sàng ($avdName)." -ForegroundColor Green

# 3. Chạy Expo và mở app trên emulator.
#    - 10.0.2.2 là địa chỉ máy host nhìn từ trong emulator: bắt buộc để Expo Go tải được
#      JS bundle và app gọi được API backend.
#    - --offline: không gọi máy chủ expo.dev, nên không bị đòi đăng nhập tài khoản Expo
#      hay hỏi cập nhật Expo Go giữa chừng.
$env:ANDROID_HOME = $sdk
$env:Path = "$sdk\platform-tools;$env:Path"
$env:REACT_NATIVE_PACKAGER_HOSTNAME = "10.0.2.2"
Set-Location "$PSScriptRoot\..\mobile"
npx expo start --android --offline
