# Paperless Meeting Mobile

Ứng dụng Android bằng Expo/React Native cho role Participant.

## Chạy trên Android

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

Nếu chạy điện thoại thật, đổi `mobile/.env` sang IP LAN của máy đang chạy backend, ví dụ:

```text
EXPO_PUBLIC_API_URL=http://192.168.1.5:4000/api
```

Tài khoản demo sau khi seed database:

```text
participant1@example.com / 123456
participant2@example.com / 123456
```

