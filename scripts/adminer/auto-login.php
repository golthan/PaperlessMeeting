<?php
/**
 * Tu dang nhap Adminer vao database demo cua Paperless Meeting.
 *
 * Mo http://localhost:8080 la vao thang danh sach bang, khong phai chon
 * "PostgreSQL" va go tay tai khoan moi lan. Chi dung cho may dev / demo:
 * Adminer chi mo o cong 8080 tren may nay.
 *
 * Cach lam: moi lan mo trang (GET) ma phien chua dang nhap thi gia lap mot
 * lan bam nut "Login" voi tai khoan lay tu docker-compose.yml.
 */
final class PaperlessAutoLogin extends \Adminer\Plugin {
    // Form dang nhap gia lap khong co ma chong CSRF nen phai bo buoc kiem tra nay.
    public function verifyLoginToken() {
        return false;
    }
}

$paperlessAuth = [
    'driver' => 'pgsql',
    'server' => getenv('ADMINER_DEFAULT_SERVER') ?: 'postgres',
    'username' => getenv('ADMINER_AUTO_USER') ?: 'paperless',
    'password' => getenv('ADMINER_AUTO_PASSWORD') ?: 'paperless',
    'db' => getenv('ADMINER_AUTO_DB') ?: 'paperless_meeting',
];

if (
    $_SERVER['REQUEST_METHOD'] === 'GET'
    && empty($_SESSION['pwds']['pgsql'][$paperlessAuth['server']][$paperlessAuth['username']])
) {
    $_POST['auth'] = $paperlessAuth;
}

return new PaperlessAutoLogin;
