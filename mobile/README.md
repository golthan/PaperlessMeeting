# Paperless Meeting Mobile

Ứng dụng Android bằng Expo/React Native cho role Participant. Người tham dự làm
được trên điện thoại mọi việc như trên web: nhận lời mời, dự họp trực tuyến
(camera/micro) lẫn họp tập trung, điểm danh, đọc tài liệu, biểu quyết, ghi chú,
trò chuyện realtime, xem và ký số biên bản.

## Hai cách chạy

| | Expo Go | Bản build (dev client / APK) |
|---|---|---|
| Cài đặt | Không cần build | Phải build một lần |
| Mọi chức năng không phải video | Đủ | Đủ |
| Camera / micro trong phòng họp | Không (mở tạm bằng trình duyệt) | Có |

Module video của LiveKit là native nên Expo Go không nạp được. App tự nhận ra
điều đó và chuyển sang nút "Mở phòng video bằng trình duyệt"; các phần còn lại
hoạt động bình thường.

## 1. Chạy nhanh bằng Expo Go

```powershell
Copy-Item mobile/.env.example mobile/.env
npm run dev:backend
npm run dev:mobile
```

Mở Expo Go trên điện thoại Android và quét QR.

Nếu chạy Android Emulator, giữ API URL:

```text
EXPO_PUBLIC_API_URL=http://10.0.2.2:4000/api
```

Nếu chạy điện thoại thật, đổi `mobile/.env` sang IP LAN của máy đang chạy backend,
ví dụ:

```text
EXPO_PUBLIC_API_URL=http://192.168.1.5:4000/api
```

## 2. Build bản có camera/micro

Cần Android Studio (Android SDK) và JDK 17.

```powershell
npm --workspace mobile run prebuild     # sinh thư mục android/
npm --workspace mobile run build:android
```

Lệnh thứ hai biên dịch và cài thẳng lên máy/emulator đang cắm, đồng thời chạy
Metro. Những lần sau chỉ cần `npm run dev:mobile` rồi mở app đã cài — không phải
build lại, trừ khi thêm thư viện native mới.

Khi vào phòng họp trực tuyến lần đầu, Android sẽ hỏi quyền micro và camera.

`app.json` đã bật sẵn `usesCleartextTraffic` vì backend nội bộ chạy HTTP/WS
(`http://…:4000`, `ws://…:7880`). Không có cờ này thì bản build sẽ không gọi
được API, dù Expo Go vẫn chạy tốt.

### LiveKit

Địa chỉ máy chủ video lấy theo thứ tự: `LIVEKIT_WS_URL` do backend trả về →
`EXPO_PUBLIC_LIVEKIT_URL` trong `.env` → mặc định `ws://<host-của-API>:7880`.
Máy chủ LiveKit khởi động cùng `docker-compose.yml` ở thư mục gốc.

## Tài khoản demo sau khi seed database

```text
participant1@example.com / 123456
participant2@example.com / 123456
```
