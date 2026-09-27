# Các hàm dùng chung cho script chạy demo (dot-source: . "$PSScriptRoot\lib.ps1").
# Mọi hàm đều không đụng tới dữ liệu trong database.

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$script:Root = (Resolve-Path "$PSScriptRoot\..").Path
$script:Sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$script:Adb = "$script:Sdk\platform-tools\adb.exe"
$script:Emulator = "$script:Sdk\emulator\emulator.exe"
$script:AppId = "com.paperlessmeeting.mobile"
$script:Apk = "$script:Root\mobile\android\app\build\outputs\apk\release\app-release.apk"

function Write-Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Write-Ok($text) { Write-Host "    $text" -ForegroundColor Green }
function Write-Warn($text) { Write-Host "    $text" -ForegroundColor Yellow }
function Stop-WithError($text) {
  Write-Host "`n$text" -ForegroundColor Red
  exit 1
}

# Chạy lệnh ngoài mà không để dòng cảnh báo trên stderr biến thành lỗi dừng
# script (PowerShell 5.1 coi mọi dòng stderr là lỗi khi ErrorAction = Stop).
function Invoke-Quiet {
  param([string]$File, [string[]]$Arguments)
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    return (& $File @Arguments 2>$null)
  } catch {
    return $null
  } finally {
    $ErrorActionPreference = $previous
  }
}

function Invoke-Adb { param([string[]]$Arguments) Invoke-Quiet $script:Adb $Arguments }

function Test-Url($url) {
  try {
    $null = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
    return $true
  } catch {
    return $false
  }
}

function Wait-Url($url, $seconds, $label) {
  $deadline = (Get-Date).AddSeconds($seconds)
  Write-Host "    Chờ $label" -NoNewline
  while (-not (Test-Url $url)) {
    if ((Get-Date) -gt $deadline) { Write-Host ""; return $false }
    Write-Host "." -NoNewline
    Start-Sleep -Seconds 2
  }
  Write-Host ""
  return $true
}

# ---------------------------------------------------------------- Docker ----

function Assert-Docker {
  $version = Invoke-Quiet "docker" @("version", "--format", "{{.Server.Version}}")
  if ($version) { return }
  $desktop = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
  if (-not (Test-Path $desktop)) {
    Stop-WithError "Chưa cài Docker Desktop hoặc Docker chưa chạy."
  }
  Write-Warn "Docker Desktop chưa chạy, đang mở..."
  Start-Process $desktop
  $deadline = (Get-Date).AddMinutes(3)
  while (-not (Invoke-Quiet "docker" @("version", "--format", "{{.Server.Version}}"))) {
    if ((Get-Date) -gt $deadline) { Stop-WithError "Docker Desktop chưa sẵn sàng sau 3 phút." }
    Start-Sleep -Seconds 3
  }
}

<#
  Chọn IP mà LiveKit quảng bá cho client để truyền hình và tiếng.

  Mặc định LiveKit quảng bá 127.0.0.1: trình duyệt trên chính máy này dùng được,
  nhưng trong emulator 127.0.0.1 là chính cái emulator, nên vào được phòng mà
  màn hình đen, không có tiếng. Cần một IP mà cả máy này lẫn emulator cùng tới
  được. Thứ tự ưu tiên:
    1. Biến môi trường LIVEKIT_NODE_IP (tự đặt, ví dụ khi thử bằng điện thoại thật).
    2. Card mạng ảo host-only (VirtualBox, VMware, Hyper-V): luôn bật kể cả khi
       rút Wi-Fi, nên đang demo mà mất mạng thì video vẫn chạy.
    3. Card mạng đang ra Internet (Wi-Fi / Ethernet).
#>
function Get-MediaIp {
  if ($env:LIVEKIT_NODE_IP) { return $env:LIVEKIT_NODE_IP }

  $addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" }
  $candidates = foreach ($address in $addresses) {
    $adapter = Get-NetAdapter -InterfaceIndex $address.InterfaceIndex -ErrorAction SilentlyContinue
    if ($adapter -and $adapter.Status -eq "Up") {
      [pscustomobject]@{ Ip = $address.IPAddress; Description = "$($adapter.InterfaceDescription)" }
    }
  }

  # VirtualBox / VMware giữ IP cố định; Hyper-V (WSL) đổi IP sau mỗi lần khởi động
  # lại máy nhưng vẫn đứng yên trong suốt một buổi demo.
  foreach ($pattern in @("VirtualBox Host-Only", "VMware Virtual Ethernet Adapter for VMnet1\b", "Hyper-V Virtual Ethernet")) {
    $hostOnly = $candidates | Where-Object { $_.Description -match $pattern } | Select-Object -First 1
    if ($hostOnly) { return $hostOnly.Ip }
  }

  $route = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue |
    Sort-Object { $_.RouteMetric + $_.InterfaceMetric } | Select-Object -First 1
  if ($route) {
    $ip = Get-NetIPAddress -InterfaceIndex $route.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($ip) { return $ip.IPAddress }
  }

  $any = $candidates | Select-Object -First 1
  if ($any) { return $any.Ip }
  return $null
}

# Ghi LIVEKIT_NODE_IP vào file .env ở thư mục gốc: docker compose tự đọc file này,
# nên sau đó chạy "docker compose up" bằng tay cũng giữ đúng IP.
function Set-RootEnvValue($name, $value) {
  $path = "$script:Root\.env"
  $lines = @()
  if (Test-Path $path) { $lines = @(Get-Content $path | Where-Object { $_ -notmatch "^$name=" }) }
  $lines += "$name=$value"
  Set-Content -Path $path -Value $lines -Encoding ascii
}

# Bật PostgreSQL + LiveKit (và các dịch vụ thêm nếu có). Dữ liệu nằm trong volume
# Docker nên bật / tạo lại container không làm mất dữ liệu.
function Start-Infra {
  param([string[]]$Extra = @())
  Write-Step "Bật database và máy chủ video (Docker)"
  Assert-Docker

  $ip = Get-MediaIp
  if (-not $ip) {
    Write-Warn "Không tìm được IP nào ngoài 127.0.0.1, video trong emulator sẽ không có hình/tiếng."
    $ip = "127.0.0.1"
  }
  Set-RootEnvValue "LIVEKIT_NODE_IP" $ip
  $env:LIVEKIT_NODE_IP = $ip

  $services = @("postgres", "livekit") + $Extra
  $arguments = @("compose")
  if ($Extra.Count -gt 0) { $arguments += @("--profile", "tools") }
  $arguments += @("up", "-d") + $services
  # Compose tự tạo lại container livekit nếu IP đổi so với lần trước. Compose in
  # tiến độ ra stderr nên phải hạ ErrorAction, không thì PowerShell 5.1 coi là lỗi.
  Push-Location $script:Root
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & docker @arguments 2>&1 | ForEach-Object { "$_" }
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
    Pop-Location
  }
  $output | Where-Object { $_ -match "Recreat|error" } | ForEach-Object { Write-Host "    $_" }
  if ($code -ne 0) { Stop-WithError "docker compose up thất bại:`n$($output -join "`n")" }
  Write-Ok "PostgreSQL :5432, LiveKit :7880 (IP truyền hình/tiếng: $ip)"
}

# ------------------------------------------------------- Backend / web ----

function Get-ListeningPid($port) {
  $connection = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($connection) { return $connection.OwningProcess }
  return $null
}

# Mở một cửa sổ PowerShell riêng chạy lệnh npm, để log hiện ở đó và tắt được bằng Ctrl+C.
function Start-NpmWindow($title, $npmScript) {
  $command = "`$Host.UI.RawUI.WindowTitle = '$title'; Set-Location '$($script:Root)'; npm run $npmScript"
  Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $command
}

function Start-Backend {
  Write-Step "Backend (http://localhost:4000)"
  if (Test-Url "http://localhost:4000/api/health") {
    Write-Ok "Backend đang chạy."
    return
  }
  $stale = Get-ListeningPid 4000
  if ($stale) {
    Stop-WithError "Cổng 4000 đang bị tiến trình $stale giữ nhưng không trả lời. Tắt nó: taskkill /PID $stale /T /F"
  }
  Start-NpmWindow "Paperless - backend" "dev:backend"
  if (-not (Wait-Url "http://localhost:4000/api/health" 60 "backend khởi động")) {
    Stop-WithError "Backend chưa chạy được sau 60 giây, xem lỗi ở cửa sổ 'Paperless - backend'."
  }
  Write-Ok "Backend đã chạy (cửa sổ riêng 'Paperless - backend')."
}

function Start-Frontend {
  Write-Step "Web (http://localhost:5173)"
  if (Test-Url "http://localhost:5173") {
    Write-Ok "Web đang chạy."
    return
  }
  Start-NpmWindow "Paperless - web" "dev:frontend"
  if (-not (Wait-Url "http://localhost:5173" 60 "web khởi động")) {
    Stop-WithError "Web chưa chạy được sau 60 giây, xem lỗi ở cửa sổ 'Paperless - web'."
  }
  Write-Ok "Web đã chạy (cửa sổ riêng 'Paperless - web')."
}

# -------------------------------------------------------------- Emulator ----

function Test-EmulatorBooted {
  $boot = Invoke-Adb @("shell", "getprop", "sys.boot_completed")
  return ("$boot".Trim() -eq "1")
}

function Get-QemuProcess {
  return Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like "qemu-system*" }
}

# Máy ảo coi là đang chạy khi tiến trình qemu còn sống hoặc adb thấy thiết bị.
# Không dựa vào emulator.exe: tiến trình vỏ này có thể sót lại sau khi máy ảo tắt.
function Test-EmulatorAlive {
  if (Get-QemuProcess) { return $true }
  return [bool](Invoke-Adb @("devices") | Select-String "emulator-\d+")
}

function Get-AvdName {
  if ($env:AVD_NAME) { return $env:AVD_NAME }
  return (& $script:Emulator -list-avds | Where-Object { $_.Trim() } | Select-Object -First 1)
}

# -no-snapshot-load: luôn khởi động sạch. Bản lưu Quick Boot dễ hỏng khi emulator
# bị tắt ngang; nạp phải bản hỏng thì Android đứng hình và adb báo "offline" mãi.
# Camera trước là camera giả của emulator (hình chuyển động); đặt EMU_CAMERA=webcam0
# để dùng webcam thật của laptop.
function Start-EmulatorProcess($avdName) {
  Write-Host "    Đang khởi động emulator $avdName..."
  $arguments = @("-avd", $avdName, "-no-boot-anim", "-no-snapshot-load")
  if ($env:EMU_CAMERA) { $arguments += @("-camera-front", $env:EMU_CAMERA) }
  Start-Process -FilePath $script:Emulator -ArgumentList $arguments
}

function Stop-EmulatorProcess {
  Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessName -like "qemu-system*" -or $_.ProcessName -eq "emulator" } |
    Stop-Process -Force -ErrorAction SilentlyContinue
  $until = (Get-Date).AddSeconds(20)
  while ((Get-QemuProcess) -and (Get-Date) -lt $until) { Start-Sleep -Milliseconds 500 }
}

function Start-Emulator {
  Write-Step "Android Emulator"
  if (-not (Test-Path $script:Emulator)) { Stop-WithError "Không tìm thấy Android SDK ở $script:Sdk" }
  $avdName = Get-AvdName
  if (-not $avdName) {
    Stop-WithError "Chưa có AVD nào. Mở Android Studio > Device Manager để tạo một máy ảo."
  }

  $null = Invoke-Adb @("start-server")
  $attached = Test-EmulatorAlive
  if ($attached) { Write-Host "    Emulator đã được bật, chờ khởi động xong..." } else { Start-EmulatorProcess $avdName }
  $launchedAt = Get-Date
  $retried = $false

  if (-not (Test-EmulatorBooted)) {
    Write-Host "    Chờ emulator khởi động xong (thường 1-2 phút)" -NoNewline
    $deadline = (Get-Date).AddMinutes(5)
    while (-not (Test-EmulatorBooted)) {
      if ((Get-Date) -gt $deadline) {
        Stop-WithError "Emulator chưa khởi động xong sau 5 phút. Tắt hẳn cửa sổ emulator rồi chạy lại lệnh."
      }
      $waited = ((Get-Date) - $launchedAt).TotalSeconds
      if (-not $retried -and $attached -and $waited -gt 60) {
        # Emulator bật sẵn đã chạy hơn 2 phút mà vẫn không dùng được: gần như chắc
        # chắn treo do nạp bản lưu Quick Boot hỏng. Tắt đi, khởi động sạch.
        $qemu = Get-QemuProcess | Select-Object -First 1
        if ($qemu -and ((Get-Date) - $qemu.StartTime).TotalSeconds -gt 120) {
          Write-Host ""
          Write-Warn "Emulator đang bị treo, khởi động lại sạch..."
          Stop-EmulatorProcess
          Start-EmulatorProcess $avdName
          $retried = $true
          $launchedAt = Get-Date
          $deadline = (Get-Date).AddMinutes(5)
        }
      } elseif (-not $retried -and -not $attached -and $waited -gt 30 -and -not (Test-EmulatorAlive)) {
        Write-Host ""
        Start-EmulatorProcess $avdName
        $retried = $true
      }
      Write-Host "." -NoNewline
      Start-Sleep -Seconds 3
    }
    Write-Host ""
  }

  # Mặc định micro ảo của emulator KHÔNG nhận tiếng từ micro laptop: bật micro
  # trong app vẫn chỉ gửi đi im lặng. Lệnh này nối micro thật vào emulator.
  $null = Invoke-Adb @("emu", "avd", "hostmicon")
  Write-Ok "Emulator sẵn sàng ($avdName), đã nối micro laptop vào emulator."
}

# ------------------------------------------------------------------ App ----

function Install-App {
  Write-Step "Cài app Paperless Meeting lên emulator"
  if (-not (Test-Path $script:Apk)) {
    Stop-WithError "Chưa có bản APK. Chạy: npm run android:build"
  }
  $result = Invoke-Adb @("install", "-r", $script:Apk)
  if (-not ("$result" -match "Success")) { Stop-WithError "Cài APK thất bại: $result" }
  # Cấp sẵn quyền micro/camera để lúc demo không hiện hộp thoại xin quyền.
  foreach ($permission in @("RECORD_AUDIO", "CAMERA", "POST_NOTIFICATIONS", "BLUETOOTH_CONNECT")) {
    $null = Invoke-Adb @("shell", "pm", "grant", $script:AppId, "android.permission.$permission")
  }
  $built = (Get-Item $script:Apk).LastWriteTime.ToString("dd/MM HH:mm")
  Write-Ok "Đã cài bản build lúc $built và cấp sẵn quyền micro/camera."
}

function Start-App {
  $null = Invoke-Adb @("shell", "am", "force-stop", $script:AppId)
  $null = Invoke-Adb @("shell", "monkey", "-p", $script:AppId, "-c", "android.intent.category.LAUNCHER", "1")
  Write-Ok "Đã mở app trên emulator."
}
