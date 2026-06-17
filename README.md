# Paperless Meeting System

Hệ thống phòng họp không giấy tờ theo spec Live, không tích hợp AI Summary.

## Chức năng chính

- Backend Node.js + Express + PostgreSQL, JWT auth, phân quyền Admin, Organizer, Participant.
- Quản lý phòng ban, phòng họp, người dùng, cuộc họp, người tham dự, tài liệu, agenda, điểm danh, biểu quyết, biên bản, task.
- Live Meeting Room bằng Socket.IO: trạng thái online, chat realtime, raise hand, cập nhật agenda/tài liệu/vote/điểm danh/ghi chú chung.
- Họp `OFFLINE`, `ONLINE`, `HYBRID`; bản online/hybrid tự tạo phòng Jitsi.
- Archive sau họp gồm nội dung họp, chat, ghi chú chung, attendance và session.
- Frontend React/Vite cho Admin, Organizer, Participant.
- Mobile Android Expo cho Participant, có màn hình Live để mở Jitsi, chat, notes, agenda, tài liệu và vote.

## Yêu cầu

- Node.js 20+.
- Docker Desktop để chạy PostgreSQL demo.
- Expo Go trên điện thoại Android nếu chạy app mobile bằng QR.

## Chạy nhanh bằng Docker PostgreSQL

Từ thư mục gốc dự án:

```powershell
npm install
docker compose up -d postgres
npm run seed
```

Mở 2 terminal:

```powershell
npm run dev:backend
```

```powershell
npm run dev:frontend
```

URL:

```text
Web: http://localhost:5173
API health: http://localhost:4000/api/health
```

Tài khoản demo:

```text
admin@example.com / 123456
organizer@example.com / 123456
participant1@example.com / 123456
participant2@example.com / 123456
```

Lưu ý: `npm run seed` reset dữ liệu demo trong database.

## Chạy app Android

Terminal 1:

```powershell
npm run dev:backend
```

Terminal 2:

```powershell
npm run dev:mobile
```

Sau đó mở Expo Go trên điện thoại Android và quét QR trong terminal.

File cấu hình API cho mobile:

```text
mobile/.env
```

Nếu chạy trên điện thoại thật, đặt IP LAN của máy đang chạy backend:

```text
EXPO_PUBLIC_API_URL=http://192.168.1.5:4000/api
```

Nếu chạy Android Emulator:

```text
EXPO_PUBLIC_API_URL=http://10.0.2.2:4000/api
```

Điện thoại và máy tính cần cùng mạng LAN, firewall Windows cần cho phép port `4000`. Jitsi cần kết nối internet.

## Luồng demo Live

1. Đăng nhập Organizer trên web.
2. Tạo cuộc họp, chọn loại `HYBRID` hoặc `ONLINE`, thêm participant.
3. Mở chi tiết cuộc họp hoặc danh sách cuộc họp, bấm `Bắt đầu & vào phòng`.
4. Đăng nhập Participant trên web hoặc Android, nhận lời mời, rồi bấm `Vào phòng` khi cuộc họp đang `ONGOING`.
5. Thử chat, điểm danh, ghi chú cá nhân, ghi chú chung, agenda, trình chiếu tài liệu và vote.

## Cấu hình Jitsi

Mặc định project trỏ tới dịch vụ công cộng:

```text
https://meet.jit.si
```

`meet.jit.si` là dịch vụ của bên thứ ba. Dịch vụ này có thể yêu cầu người tạo phòng phải đăng nhập làm moderator của Jitsi, nên bạn có thể thấy màn hình `The conference has not yet started because no moderators have yet arrived`. Tài khoản Organizer trong hệ thống này không tự động là tài khoản moderator của Jitsi.

Để demo không phụ thuộc bên thứ ba, hãy chạy một Jitsi self-host hoặc dùng domain Jitsi nội bộ, rồi sửa `backend/.env`:

```text
JITSI_DOMAIN=your-jitsi-domain.local
JITSI_SCHEME=https
JITSI_ROOM_URL_BASE=https://your-jitsi-domain.local
JITSI_EXTERNAL_API_URL=https://your-jitsi-domain.local/external_api.js
```

Ví dụ nếu Jitsi local chạy ở `https://localhost:8443`:

```text
JITSI_DOMAIN=localhost:8443
JITSI_SCHEME=https
JITSI_ROOM_URL_BASE=https://localhost:8443
JITSI_EXTERNAL_API_URL=https://localhost:8443/external_api.js
```

Sau khi đổi `.env`, restart backend và frontend. Nếu muốn dữ liệu demo cũng đổi URL phòng, chạy lại:

```powershell
npm run seed
```

Gợi ý triển khai Jitsi bằng Docker: dùng repo chính thức `jitsi/docker-jitsi-meet`, cấu hình `ENABLE_AUTH=0` cho demo nội bộ hoặc cấu hình JWT/auth nếu cần bảo mật production.

## Lệnh kiểm tra

```powershell
npm run check
```

Lệnh này kiểm tra backend, build frontend production và export bundle Android bằng Expo.

## Docker

Project hiện dùng Docker cho PostgreSQL:

```powershell
docker compose up -d postgres
```

Dừng database:

```powershell
docker compose down
```

Dừng và xóa dữ liệu PostgreSQL demo:

```powershell
docker compose down -v
```

Backend, frontend và mobile vẫn chạy bằng Node.js để dễ phát triển và debug.
