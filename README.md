# Paperless Meeting System

Hệ thống phòng họp không giấy tờ theo file spec, phạm vi MVP không tích hợp AI Summary.

## Thành phần đã triển khai

- Backend Node.js + Express + PostgreSQL.
- JWT authentication, bcrypt hash password, role-based access control.
- Schema PostgreSQL cho các module: users, departments, rooms, meetings, participants, documents, agenda, attendance, votes, minutes, tasks.
- Seed data demo cho Admin, Organizer, Participant, phòng ban, phòng họp và một cuộc họp mẫu.
- REST API cho auth, user, department, room, meeting, participant, document, agenda, attendance, vote, minutes, task, dashboard.
- Frontend React/Vite cho 3 role: Admin, Organizer, Participant.
- Mobile Android React Native/Expo cho role Participant.
- Upload tài liệu local trong `backend/uploads`.
- Export biên bản dạng PDF.

## Yêu cầu môi trường

- Node.js 20+.
- PostgreSQL 14+.
- Docker là tùy chọn nếu muốn chạy PostgreSQL bằng `docker compose`.
- Expo Go trên điện thoại Android nếu chạy app mobile bằng QR.

## Cài đặt

```powershell
npm install
```

Mặc định backend dùng:

```text
postgres://paperless:paperless@localhost:5432/paperless_meeting
```

Nếu dùng Docker:

```powershell
docker compose up -d postgres
```

Nếu dùng PostgreSQL local, tạo database/user tương ứng hoặc sửa `DATABASE_URL` trong `backend/.env`.

## Chạy nhanh bằng Docker PostgreSQL

Từ thư mục gốc dự án:

```powershell
npm install
docker compose up -d postgres
npm run seed
```

Sau đó mở 2 terminal:

Terminal 1:

```powershell
npm run dev:backend
```

Terminal 2:

```powershell
npm run dev:frontend
```

URL để thử:

```text
Web: http://localhost:5173
API health: http://localhost:4000/api/health
```

Nếu muốn dừng PostgreSQL Docker:

```powershell
docker compose down
```

Nếu muốn xóa luôn dữ liệu PostgreSQL demo:

```powershell
docker compose down -v
```

## Seed database

```powershell
npm run seed
```

Tài khoản demo:

```text
admin@example.com / 123456
organizer@example.com / 123456
participant1@example.com / 123456
participant2@example.com / 123456
```

## Chạy backend và web

Terminal 1:

```powershell
npm run dev:backend
```

Terminal 2:

```powershell
npm run dev:frontend
```

URL:

```text
Frontend: http://localhost:5173
Backend health: http://localhost:4000/api/health
Base API: http://localhost:4000/api
```

## Chạy app Android

Terminal 1, chạy backend:

```powershell
npm run dev:backend
```

Terminal 2, chạy Expo:

```powershell
npm run dev:mobile
```

Sau đó mở Expo Go trên điện thoại Android và quét QR trong terminal.

File cấu hình API cho mobile:

```text
mobile/.env
```

Nếu chạy trên điện thoại thật, `EXPO_PUBLIC_API_URL` phải là IP LAN của máy đang chạy backend, ví dụ:

```text
EXPO_PUBLIC_API_URL=http://192.168.1.5:4000/api
```

Nếu chạy Android Emulator, dùng:

```text
EXPO_PUBLIC_API_URL=http://10.0.2.2:4000/api
```

Lưu ý: điện thoại và máy tính phải cùng mạng LAN, và firewall Windows cần cho phép port `4000`.

## Luồng demo nhanh

1. Đăng nhập Admin, quản lý user, phòng ban, phòng họp, cấp role Organizer.
2. Đăng nhập Organizer, tạo cuộc họp, chọn phòng, thêm participant.
3. Trong chi tiết cuộc họp, upload tài liệu, tạo agenda, tạo QR điểm danh, tạo vote, viết biên bản, giao task.
4. Đăng nhập Participant trên web hoặc Android, xem cuộc họp được mời, xác nhận tham gia, xem tài liệu/agenda, điểm danh, vote, xem biên bản đã công bố, cập nhật task.

## Kiểm tra

```powershell
npm run check
```

`npm run check` kiểm tra backend, build frontend production và export bundle Android bằng Expo.

## Ghi chú

- Máy hiện tại chưa có Docker hoặc `psql` trong PATH, nên bước seed cần chạy sau khi bạn có PostgreSQL.
- Backend, frontend và mobile Android đã được build/export thành công.
- Mobile MVP hiện ưu tiên Participant theo spec; Admin/Organizer vẫn dùng bản web.
- `npm audit` còn cảnh báo moderate trong chuỗi Expo SDK 54/Metro. Không dùng `npm audit fix --force` ở đây vì nó nâng sang Expo SDK khác và có thể làm lệch khả năng chạy Expo Go theo SDK đã chọn.
