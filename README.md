# Paperless Meeting System

Hệ thống phòng họp không giấy tờ theo spec Live, không tích hợp AI Summary.

## Chức năng chính

- Backend Node.js + Express + PostgreSQL, JWT auth, phân quyền Admin, Organizer, Participant.
- Quản lý phòng ban, phòng họp, người dùng, cuộc họp, người tham dự, tài liệu, agenda, điểm danh, biểu quyết, biên bản, task.
- Live Meeting Room bằng Socket.IO: trạng thái online, chat realtime, raise hand, cập nhật agenda/tài liệu/vote/điểm danh/ghi chú chung.
- Trung tâm thông báo cho cả 3 vai trò: mời họp, đổi lịch, huỷ họp, bắt đầu/kết thúc, nhắc lịch trước 15 phút, duyệt tài liệu, mở biểu quyết, ban hành biên bản, giao và cập nhật nhiệm vụ. Thông báo hiện realtime ở góc phải trên (web và mobile) kèm chuông đếm số chưa đọc.
- Tác vụ nền định kỳ: nhắc lịch họp sắp diễn ra, tự chuyển nhiệm vụ quá hạn sang OVERDUE, tự đóng cuộc họp quá giờ kết thúc.
- Họp `OFFLINE`, `ONLINE`, `HYBRID`; bản online/hybrid tự tạo phòng họp video LiveKit self-host (không phụ thuộc dịch vụ bên thứ ba).
- Archive sau họp gồm nội dung họp, chat, ghi chú chung, attendance và session.
- Frontend React/Vite cho Admin, Organizer, Participant.
- Mobile Android Expo cho Participant, có màn hình Live để mở phòng họp video, chat, notes, agenda, tài liệu và vote.

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

## Chạy app Android bằng Emulator (khuyên dùng khi dev)

Yêu cầu: Android SDK + emulator đã cài (mặc định ở `%LOCALAPPDATA%\Android\Sdk`) và AVD tên `Pixel_API_36`.

Terminal 1:

```powershell
npm run dev:backend
```

Terminal 2:

```powershell
npm run android:emu
```

Script sẽ tự bật emulator (nếu chưa chạy), chờ boot xong rồi mở app trong Expo Go. Trong `mobile/.env` cần có:

```text
EXPO_PUBLIC_API_URL=http://10.0.2.2:4000/api
```

`10.0.2.2` là địa chỉ đặc biệt trỏ về máy host khi nhìn từ trong emulator. Script cũng đặt `REACT_NATIVE_PACKAGER_HOSTNAME=10.0.2.2` để Expo Go trong emulator tải được JS bundle — nếu chạy `expo start` thủ công thì phải tự đặt biến này.

Phím tắt hữu ích khi app đang chạy: gõ `r` trong terminal Expo để reload, `j` mở JS debugger, `Ctrl+M` trong emulator mở dev menu.

## Chạy app Android trên điện thoại thật

Terminal 1:

```powershell
npm run dev:backend
```

Terminal 2:

```powershell
npm run dev:mobile
```

Sau đó mở Expo Go trên điện thoại Android và quét QR trong terminal. Đổi `mobile/.env` sang IP LAN của máy đang chạy backend:

```text
EXPO_PUBLIC_API_URL=http://192.168.1.5:4000/api
```

Điện thoại và máy tính cần cùng mạng LAN, firewall Windows cần cho phép port `4000`, `8081`, `5173`, `7880`, `7881` và dải UDP `50000-50019` (LiveKit).

Lưu ý monorepo: project dùng npm workspaces nên có 2 bản React (frontend và mobile). File `mobile/metro.config.js` ép Metro luôn dùng `mobile/node_modules/react` — không xóa file này, nếu không app sẽ crash với lỗi "Incompatible React versions".

## Luồng demo Live

1. Đăng nhập Organizer trên web.
2. Tạo cuộc họp, chọn loại `HYBRID` hoặc `ONLINE`, thêm participant.
3. Mở chi tiết cuộc họp hoặc danh sách cuộc họp, bấm `Bắt đầu & vào phòng`.
4. Đăng nhập Participant trên web hoặc Android, nhận lời mời, rồi bấm `Vào phòng` khi cuộc họp đang `ONGOING`.
5. Thử chat, điểm danh, ghi chú cá nhân, ghi chú chung, agenda, trình chiếu tài liệu và vote.
6. Mở mục `Thông báo` (chuông ở góc phải trên hoặc menu bên trái) để xem lời mời, thay đổi lịch, biểu quyết và nhiệm vụ mới.

## Thông báo (web + mobile)

- Backend lưu thông báo trong bảng `notifications` và đẩy realtime qua Socket.IO tới room riêng `user:<id>` của từng người, nên người dùng nhận được thông báo ở mọi màn hình chứ không chỉ trong phòng Live.
- Web: `ToastProvider` hiện toast ở góc phải trên, `NotificationBell` trên thanh trên cùng hiển thị số chưa đọc, trang `/{role}/notifications` cho phép lọc, đánh dấu đã đọc và xoá.
- Mobile: app không mở socket mà hỏi API 20 giây một lần (`useNotificationCenter`), thông báo mới hiện toast góc phải trên, tab `Thông báo` có badge số chưa đọc.
- API: `GET /notifications`, `GET /notifications/unread-count`, `PUT /notifications/:id/read`, `PUT /notifications/read-all`, `DELETE /notifications/:id`, `DELETE /notifications/read`.

## Phòng họp video LiveKit (self-host)

Phòng họp video chạy hoàn toàn trên máy của bạn bằng LiveKit server (mã nguồn mở), khởi động cùng docker-compose:

```powershell
docker compose up -d livekit
```

Cách hoạt động:

- Backend tự sinh access token LiveKit cho từng người trong API `GET /meetings/:id/live-config` (quyền publish mic/camera/share màn hình lấy từ quyền của người tham dự trong cuộc họp; Organizer là room admin).
- Web nhúng phòng họp trực tiếp trong trang Live bằng `@livekit/components-react`.
- Mobile mở trang `/join/:meetingId` của frontend trong trình duyệt, token đính kèm trong URL nên không cần đăng nhập lại.

Cấu hình (tùy chọn) trong `backend/.env`:

```text
LIVEKIT_API_KEY=paperless-key
LIVEKIT_API_SECRET=paperless_livekit_dev_secret_0123456789
# Để trống thì client tự nối tới ws://<hostname đang mở trang>:7880
LIVEKIT_WS_URL=
```

Key/secret mặc định phải khớp với `livekit.yaml`. Khi triển khai thật, đổi secret ở cả hai nơi.

Test bằng điện thoại/emulator (media chạy qua UDP nên LiveKit cần quảng bá đúng IP):

```powershell
$env:LIVEKIT_NODE_IP = "192.168.1.5"   # IP LAN của máy chạy Docker
docker compose up -d livekit
```

Lưu ý trình duyệt trên điện thoại/emulator chặn camera/mic với trang `http://` không phải localhost (insecure context). Khi demo, mở `chrome://flags/#unsafely-treat-insecure-origin-as-secure` trên thiết bị, thêm `http://<IP LAN>:5173` (emulator: `http://10.0.2.2:5173`) rồi bật lại Chrome.

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
