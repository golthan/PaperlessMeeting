# Mở nhiều cửa sổ trình duyệt để thử cuộc họp với nhiều người trên CÙNG MỘT MÁY.
#   npm run test:windows                         -> 3 cửa sổ, micro/camera giả
#   npm run test:windows -- -Count 4             -> 4 cửa sổ
#   .\scripts\open-test-windows.ps1 -RealDevices -> dùng micro/camera thật
#
# Vì sao cần script này thay vì tự mở thêm tab:
#   1. Các tab/cửa sổ cùng một hồ sơ trình duyệt dùng chung localStorage, mà hệ
#      thống lưu phiên đăng nhập ở đó -> đăng nhập người thứ hai là đè mất người
#      thứ nhất. Mỗi cửa sổ ở đây có hồ sơ riêng nên đăng nhập độc lập, và nhớ
#      luôn phiên cho lần mở sau.
#   2. Windows thường chỉ cho MỘT tiến trình giữ camera thật tại một thời điểm,
#      nên cửa sổ thứ hai báo "camera đang bị chiếm". Micro/camera giả của Chrome
#      (camera là hình nhiễu có đồng hồ, micro là tiếng bíp) thì cửa sổ nào cũng
#      bật được cùng lúc, và không bị hú tiếng như khi nhiều micro thật cùng mở.
# Yêu cầu: đã chạy backend và frontend (npm run dev:backend, npm run dev:frontend).

param(
  [int]$Count = 3,
  [string]$Url = "http://localhost:5173/login",
  [switch]$RealDevices
)

$ErrorActionPreference = "Stop"
# Windows PowerShell 5.1 mặc định không in được tiếng Việt ra terminal.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$candidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$browser = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $browser) {
  Write-Host "Không tìm thấy Chrome hay Edge trên máy." -ForegroundColor Red
  exit 1
}

if ($Count -lt 1) { $Count = 1 }
if ($Count -gt 8) {
  Write-Host "Giới hạn 8 cửa sổ để máy không quá tải." -ForegroundColor Yellow
  $Count = 8
}

# Xếp cửa sổ thành lưới để nhìn được cả phòng họp cùng lúc.
Add-Type -AssemblyName System.Windows.Forms
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$columns = [Math]::Min($Count, 3)
$rows = [Math]::Ceiling($Count / $columns)
$width = [Math]::Floor($screen.Width / $columns)
$height = [Math]::Floor($screen.Height / $rows)

$profileRoot = Join-Path $env:TEMP "paperless-test-windows"

Write-Host ""
Write-Host "Mở $Count cửa sổ bằng $(Split-Path $browser -Leaf)" -ForegroundColor Cyan
if ($RealDevices) {
  Write-Host "Dùng micro/camera THẬT: thường chỉ một cửa sổ giữ được camera, và nên đeo tai nghe để khỏi hú." -ForegroundColor Yellow
} else {
  Write-Host "Dùng micro/camera GIẢ: cửa sổ nào cũng bật được mic và camera cùng lúc." -ForegroundColor Green
}
Write-Host ""

for ($i = 0; $i -lt $Count; $i++) {
  # Hồ sơ riêng cho từng cửa sổ -> localStorage riêng -> đăng nhập người khác nhau.
  $profileDir = Join-Path $profileRoot "nguoi-$($i + 1)"
  New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

  $x = $screen.X + ($i % $columns) * $width
  $y = $screen.Y + [Math]::Floor($i / $columns) * $height

  $arguments = @(
    "--user-data-dir=`"$profileDir`"",
    "--no-first-run",
    "--no-default-browser-check",
    "--new-window",
    "--window-position=$x,$y",
    "--window-size=$width,$height"
  )
  if (-not $RealDevices) {
    $arguments += "--use-fake-device-for-media-stream"
    $arguments += "--use-fake-ui-for-media-stream"
  }
  $arguments += $Url

  Start-Process -FilePath $browser -ArgumentList $arguments | Out-Null
  Write-Host "  Cửa sổ $($i + 1): hồ sơ $profileDir"
  Start-Sleep -Milliseconds 400
}

Write-Host ""
Write-Host "Đăng nhập mỗi cửa sổ bằng một tài khoản khác nhau (mật khẩu mẫu: 123456)." -ForegroundColor Cyan
Write-Host "Phiên đăng nhập được nhớ theo từng cửa sổ, lần sau chạy lại không phải đăng nhập nữa."
Write-Host "Xoá hết hồ sơ thử:  Remove-Item -Recurse -Force `"$profileRoot`""
