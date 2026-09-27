# Mở giao diện xem database:
#   npm run db:view
#
# Adminer (http://localhost:8080): tự đăng nhập, vào thẳng danh sách bảng.
# pgAdmin (http://localhost:8081): có sơ đồ quan hệ ERD. Lần đầu mở server
# Paperless Meeting nhập mật khẩu "paperless" và tick "Save password".

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib.ps1"

Start-Infra -Extra @("adminer", "pgadmin")

if (Wait-Url "http://localhost:8080" 30 "Adminer") { Start-Process "http://localhost:8080" }
# pgAdmin khởi động lần đầu mất 30-60 giây.
if (Wait-Url "http://localhost:8081" 120 "pgAdmin") {
  Start-Process "http://localhost:8081"
} else {
  Write-Warn "pgAdmin chưa lên, chờ thêm rồi mở http://localhost:8081 (xem log: docker logs paperless-meeting-pgadmin)"
}

Write-Host ""
Write-Host "Truy vấn dựng sẵn theo nghiệp vụ: npm run db:queries" -ForegroundColor Green
