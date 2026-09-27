# Chạy app mobile bằng Expo Go trên emulator (không cần build, nhưng KHÔNG có
# video trong app — phòng video phải mở bằng trình duyệt). Chỉ dùng khi chưa
# build được APK; demo thì dùng: npm run android:emu
#   npm run android:expogo

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib.ps1"

Start-Backend
Start-Emulator

# 10.0.2.2 là máy host nhìn từ trong emulator: để Expo Go tải được JS bundle.
# --offline: không gọi expo.dev nên không bị đòi đăng nhập tài khoản Expo.
$env:ANDROID_HOME = $script:Sdk
$env:Path = "$script:Sdk\platform-tools;$env:Path"
$env:REACT_NATIVE_PACKAGER_HOSTNAME = "10.0.2.2"
Set-Location "$script:Root\mobile"
npx expo start --android --offline
