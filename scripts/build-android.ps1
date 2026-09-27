# Build app Android bản release có video native (camera/micro ngay trong app).
#   npm run android:build
#
# Bản release đóng gói sẵn toàn bộ mã JS trong APK: mở app là chạy, không cần
# Metro / Expo Go, không có màn hình đỏ báo lỗi dev. Build lần đầu mất 10-20 phút
# (Gradle tải NDK và thư viện), các lần sau chỉ 1-3 phút.
#
# Mặc định build cho emulator (x86_64, API ở 10.0.2.2). Build cho điện thoại thật:
#   $env:ANDROID_ARCH = "arm64-v8a"; $env:ANDROID_API_URL = "http://192.168.1.5:4000/api"; npm run android:build

param([switch]$NoLaunch)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib.ps1"

$mobile = "$script:Root\mobile"
$env:ANDROID_HOME = $script:Sdk
$env:NODE_ENV = "production"
# Biến môi trường được ưu tiên hơn mobile/.env, nên bản build luôn trỏ đúng địa
# chỉ API mà emulator nhìn thấy (10.0.2.2 = máy host) dù .env đang để IP khác.
$env:EXPO_PUBLIC_API_URL = if ($env:ANDROID_API_URL) { $env:ANDROID_API_URL } else { "http://10.0.2.2:4000/api" }
$arch = if ($env:ANDROID_ARCH) { $env:ANDROID_ARCH } else { "x86_64" }
# Gradle truyền "--entry-file index.js" (đường dẫn tương đối) mà Metro trong monorepo
# lại tính từ thư mục gốc repo nên báo "Unable to resolve module ./index.js". Biến
# này bắt Metro lấy thư mục mobile/ làm gốc.
$env:EXPO_NO_METRO_WORKSPACE_ROOT = "1"

if (-not (Test-Path "$mobile\android")) {
  Write-Step "Sinh project Android native (expo prebuild)"
  # prebuild tự sửa mục scripts trong mobile/package.json; giữ nguyên bản gốc.
  $packageJson = [System.IO.File]::ReadAllText("$mobile\package.json")
  Push-Location $mobile
  try {
    $ErrorActionPreference = "Continue"
    $env:CI = "1"
    & npx expo prebuild --platform android --no-install
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = "Stop"
    Remove-Item Env:CI -ErrorAction SilentlyContinue
    Pop-Location
    [System.IO.File]::WriteAllText("$mobile\package.json", $packageJson)
  }
  if ($code -ne 0) { Stop-WithError "expo prebuild thất bại." }
}

Write-Step "Build APK release ($arch, API: $env:EXPO_PUBLIC_API_URL)"
Push-Location "$mobile\android"
try {
  $ErrorActionPreference = "Continue"
  & .\gradlew.bat assembleRelease "-PreactNativeArchitectures=$arch" --console=plain
  $code = $LASTEXITCODE
} finally {
  $ErrorActionPreference = "Stop"
  Pop-Location
}
if ($code -ne 0) { Stop-WithError "Build thất bại, xem lỗi Gradle ở trên." }
Write-Ok "APK: $script:Apk"

if (-not $NoLaunch -and (Test-EmulatorBooted)) {
  Install-App
  Start-App
}
