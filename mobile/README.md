# Paperless Meeting Mobile

Ứng dụng Android bằng Expo/React Native cho role Participant. Người tham dự làm
được trên điện thoại mọi việc như trên web: nhận lời mời, dự họp trực tuyến
(camera/micro) lẫn họp tập trung, điểm danh, đọc tài liệu, biểu quyết, ghi chú,
trò chuyện realtime, xem và ký số biên bản.

## Chạy trên emulator (một lệnh)

Cần Android Studio (Android SDK + ít nhất một AVD) và JDK 17. Từ thư mục gốc dự án:

```powershell
npm run android:emu
```

Lệnh này bật Docker (database + LiveKit), backend, emulator, rồi cài và mở bản
APK release có video native. Chưa có APK thì tự build lần đầu (10-20 phút).
Sửa code mobile xong thì build lại và mở app (1-3 phút):

```powershell
npm run android:build
```

Chi tiết những gì script tự cấu hình (IP cho LiveKit, micro của emulator, quyền
camera/micro) xem ở README gốc, mục "Chạy app Android bằng Emulator".

## Hai cách chạy

| | Bản APK (`android:emu`) | Expo Go (`android:expogo`) |
|---|---|---|
| Cài đặt | Build một lần | Không cần build |
| Mọi chức năng không phải video | Đủ | Đủ |
| Camera / micro trong phòng họp | Có, ngay trong app | Không (mở tạm bằng trình duyệt) |
| Cần Metro đang chạy | Không (JS đóng gói sẵn) | Có |

Module video của LiveKit là native nên Expo Go không nạp được. App tự nhận ra
điều đó và chuyển sang nút "Mở phòng video bằng trình duyệt"; các phần còn lại
hoạt động bình thường.

## Phòng video trong app

- Kết nối video bọc ngoài cả màn hình phòng họp: chuyển sang tab Trò chuyện, Tài
  liệu, Biểu quyết... vẫn nghe được cuộc họp. Ở các tab đó có thanh gọn phía trên
  để bật/tắt micro và quay lại khung video.
- Chủ tọa mời phát biểu thì app hỏi "Để sau / Bật micro". Micro không bao giờ tự
  mở; người được mời tự quyết và bật tắt được bất cứ lúc nào.
- Mạng chập chờn thì LiveKit tự nối lại; rớt hẳn thì app thử lại 3 lần và hiện
  nút "Kết nối lại". Không tự nối lại khi cùng tài khoản vừa vào ở thiết bị khác,
  để hai thiết bị không đá nhau qua lại.

Địa chỉ máy chủ video lấy theo thứ tự: `LIVEKIT_WS_URL` do backend trả về →
`EXPO_PUBLIC_LIVEKIT_URL` → mặc định `ws://<host-của-API>:7880`.

`app.json` đã bật sẵn `usesCleartextTraffic` vì backend nội bộ chạy HTTP/WS
(`http://…:4000`, `ws://…:7880`). Không có cờ này thì bản build sẽ không gọi
được API, dù Expo Go vẫn chạy tốt.

## Điện thoại Android thật

```powershell
$env:ANDROID_ARCH = "arm64-v8a"
$env:ANDROID_API_URL = "http://192.168.1.5:4000/api"   # IP Wi-Fi của máy chạy backend
$env:LIVEKIT_NODE_IP = "192.168.1.5"
docker compose up -d livekit    # LiveKit quảng bá IP Wi-Fi cho điện thoại
npm run android:build
```

APK nằm ở `mobile/android/app/build/outputs/apk/release/app-release.apk`. Điện
thoại và máy tính phải cùng mạng Wi-Fi, tường lửa Windows mở cổng `4000`, `7880`,
`7881` và UDP `50000-50019`.

## Tài khoản demo sau khi seed database

```text
participant1@example.com / 123456
participant2@example.com / 123456
```
