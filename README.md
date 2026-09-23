# Paperless Meeting System

Hệ thống phòng họp không giấy tờ theo spec Live, không tích hợp AI Summary.

## Chức năng chính

- Backend Node.js + Express + PostgreSQL, JWT auth. Vai trò hệ thống (Admin, Organizer, Participant) quyết định ai được tạo cuộc họp; còn quyền điều hành **trong** từng cuộc họp thuộc về vai trò Chủ tọa / Thư ký / Thành viên.
- Quản lý phòng ban, phòng họp, người dùng, cuộc họp, người tham dự, tài liệu, agenda, điểm danh, biểu quyết, biên bản, task.
- Live Meeting Room bằng Socket.IO: trạng thái online, chat realtime, raise hand, cập nhật agenda/tài liệu/vote/điểm danh/ghi chú chung.
- Trung tâm thông báo cho cả 3 vai trò: mời họp, đổi lịch, huỷ họp, bắt đầu/kết thúc, nhắc lịch trước 15 phút, duyệt tài liệu, mở biểu quyết, ban hành biên bản, giao và cập nhật nhiệm vụ. Thông báo hiện realtime ở góc phải trên (web và mobile) kèm chuông đếm số chưa đọc.
- **Ghi lời nói thành chữ**: người phát biểu bật micro, trình duyệt nhận dạng tiếng Việt ngay trên máy họ rồi gửi chữ về, bản ghi có tên người nói và giờ phút. AI đọc cả lời nói lẫn chat để dựng mục diễn biến của biên bản.
- Tác vụ nền định kỳ: nhắc lịch họp sắp diễn ra, tự chuyển nhiệm vụ quá hạn sang OVERDUE, tự đóng cuộc họp quá giờ kết thúc.
- Khi tạo cuộc họp, organizer chỉ chọn giữa hai hình thức rõ ràng: **họp tập trung** (`OFFLINE`) và **họp trực tuyến** (`ONLINE`). Cả hai đều chạy đầy đủ chuẩn không giấy tờ: tài liệu số, chương trình nghị sự, điểm danh, biểu quyết, biên bản, nhiệm vụ.
- Cuộc họp tập trung có thể **bật phòng họp trực tuyến bất cứ lúc nào** (kể cả đang họp) để người ở xa vào bằng video — lúc đó cuộc họp chuyển sang `HYBRID` mà vẫn giữ nguyên phòng vật lý và toàn bộ dữ liệu. Tắt đi thì quay lại `OFFLINE`.
- Phòng họp trên hệ thống mở cho mọi hình thức: họp tập trung vẫn có phòng làm việc chung (chương trình, tài liệu trình chiếu, điểm danh, biểu quyết, chat, ghi chú), chỉ khác là chưa có khung video.
- Trong phòng họp có mục **Người tham dự** tách rõ ai đang trong phòng / chưa vào phòng, kèm trạng thái giơ tay và điểm danh.
- **Biên bản điện tử có giá trị pháp lý**: tự sinh nội dung từ dữ liệu cuộc họp, ký số RSA-2048, xuất PDF tiếng Việt kèm mã QR để bất kỳ ai cũng tra cứu được tính toàn vẹn.
- **Trợ lý AI cho tài liệu**: tóm tắt tài liệu và hỏi đáp có trích dẫn số trang, dùng Claude API.
- **Nhật ký truy vết**: 29 điểm ghi log cho tài liệu, biên bản, biểu quyết, điểm danh, cuộc họp và tài khoản — biết ai đã xem, tải, sửa, ký gì và lúc nào.
- **Hộp làm việc tài liệu**: đăng tài liệu ngay giữa cuộc họp, xem nội dung, thảo luận và ghi chú riêng theo từng tài liệu, kèm chỗ dành sẵn cho tính năng tóm tắt bằng AI.
- Archive sau họp gồm nội dung họp, chat, ghi chú chung, attendance và session.
- Frontend React/Vite cho Admin, Organizer, Participant.
- Mobile Android Expo cho Participant **đầy đủ chức năng như web**: dự họp trực tuyến bằng camera/micro (LiveKit native), dự họp tập trung, realtime qua Socket.IO, giơ tay, điểm danh, hộp tài liệu (xem, ghi chú, hỏi AI, thảo luận), biểu quyết, ghi chú chung/riêng, biên bản có ký số và xuất PDF.

## Yêu cầu

- Node.js 20+.
- Docker Desktop để chạy PostgreSQL demo.
- Expo Go trên điện thoại Android nếu chạy app mobile bằng QR.
- Android Studio + JDK 17 nếu muốn build bản mobile có camera/micro (xem [`mobile/README.md`](mobile/README.md)).

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
Xem database (neu da bat): http://localhost:8080 (Adminer) hoac http://localhost:8081 (pgAdmin)
```

Tài khoản demo:

```text
admin@example.com / 123456
organizer@example.com / 123456
participant1@example.com / 123456
participant2@example.com / 123456
```

Lưu ý: `npm run seed` reset dữ liệu demo trong database.

Nếu database đã có dữ liệu thật và chỉ cần cập nhật cấu trúc bảng (ví dụ sau khi kéo bản mới có cột `online_enabled_at` và cách điểm danh `JOIN_ROOM`):

```powershell
npm run migrate
```

Lệnh này chỉ chạy `schema.sql` (các câu lệnh đều dạng `IF NOT EXISTS`) nên không xoá dữ liệu.

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

## Luồng demo

1. Đăng nhập Organizer trên web.
2. Tạo cuộc họp, chọn **Họp tập trung** và chọn phòng vật lý (không cần bật phòng trực tuyến), thêm participant.
3. Mở chi tiết cuộc họp hoặc danh sách cuộc họp, bấm `Bắt đầu & vào phòng` để vào phòng làm việc chung.
4. Đăng nhập Participant trên web hoặc Android, nhận lời mời, rồi bấm `Vào phòng họp` khi cuộc họp đang `ONGOING`.
5. Thử tab `Người tham dự`, chat, điểm danh, ghi chú cá nhân, ghi chú chung, chương trình và biểu quyết.
6. Mở tab `Tài liệu`: đăng file ngay trong lúc họp, chọn tài liệu để xem nội dung, trao đổi ở cột **Thảo luận** và ghi kết luận ở cột **Ghi chú**.
7. Khi cần người ở xa tham gia, Organizer bấm `Bật phòng trực tuyến` (ở đầu trang chi tiết hoặc ngay trong phòng họp). Khung video LiveKit hiện ra cho tất cả mọi người và hệ thống gửi thông báo.
8. Kết thúc họp, vào tab `Biên bản`: bấm `Tự sinh biên bản`, bổ sung kết luận, `Ký số`, rồi `Ban hành`. Tải PDF để xem mã QR ở chân trang, quét mã hoặc mở `/verify/<mã>` để kiểm tra tính toàn vẹn.
9. Mở mục `Thông báo` (chuông ở góc phải trên hoặc menu bên trái) để xem lời mời, thay đổi lịch, biểu quyết và nhiệm vụ mới.

## Hộp làm việc tài liệu trong phòng họp

Tab **Tài liệu** của phòng họp là một hộp làm việc gồm ba cột, gom mọi thao tác với tài liệu về một chỗ:

| Cột | Nội dung |
| --- | --- |
| Trái | Đăng tài liệu ngay trong lúc họp + danh sách tài liệu kèm trạng thái duyệt |
| Giữa | Xem nội dung tài liệu, điều khiển trình chiếu, và khối **Tóm tắt bằng AI** |
| Phải | **Thảo luận** và **Ghi chú** riêng của đúng tài liệu đang mở |

Quy tắc nghiệp vụ:

- Chủ tọa đăng tài liệu thì được duyệt ngay và hiện cho cả phòng. Người tham dự có quyền `can_upload_document` gửi được tài liệu nhưng ở trạng thái chờ duyệt — chỉ chủ tọa và chính người gửi nhìn thấy cho tới khi được duyệt.
- Tài liệu mới, duyệt, từ chối, xoá đều đẩy realtime qua Socket.IO nên người đang trong phòng thấy ngay, không phải tải lại trang.
- Cuộc họp `FINISHED` hoặc `CANCELLED` thì hồ sơ khoá lại, không nhận thêm tài liệu.
- Thảo luận trong hộp tài liệu lưu ở bảng `chat_messages` với cột `document_id`, tách khỏi chat chung của phòng họp. Ghi chú của tài liệu nằm ở bảng `document_notes`, chỉ chủ tọa và thư ký được sửa, mọi người đọc được.
- PDF và ảnh xem trực tiếp trong hộp; Word/PowerPoint/Excel hiện nút tải về. Nội dung tải kèm token qua API `GET /documents/:id/preview` chứ không mở link tĩnh.

### Chỗ cắm sẵn cho AI summarize

Khối "Tóm tắt bằng AI" đọc thẳng ba cột của bảng `documents`:

```text
ai_summary             TEXT         -- nội dung tóm tắt
ai_summary_model       VARCHAR(80)  -- model đã dùng, ví dụ claude-sonnet-5
ai_summary_updated_at  TIMESTAMPTZ  -- thời điểm tóm tắt
```

Khi làm tính năng AI, chỉ cần viết một route (ví dụ `POST /documents/:id/summary`) đọc file trong `backend/uploads`, gọi model rồi `UPDATE documents SET ai_summary = ..., ai_summary_model = ..., ai_summary_updated_at = now()`. Giao diện tự hiển thị, không phải sửa gì thêm — trường `ai_summary` đã nằm sẵn trong dữ liệu mà API chi tiết cuộc họp trả về.

Nếu muốn tóm tắt cả cuộc thảo luận chứ không chỉ file, dữ liệu đầu vào lấy từ `chat_messages` theo `document_id` và `document_notes` của cùng tài liệu.

### API liên quan

```text
POST   /meetings/:id/documents          đăng tài liệu (multipart, field "file")
GET    /documents/:id/preview           xem nội dung inline
GET    /documents/:id/download          tải về
PUT    /documents/:id/approve | reject  duyệt / từ chối
PUT    /documents/:id/present | page    trình chiếu và đổi trang
GET    /documents/:id/notes             ghi chú của tài liệu
PUT    /documents/:id/notes             lưu ghi chú (chủ tọa / thư ký)
GET    /meetings/:id/chat?documentId=   thảo luận của một tài liệu
GET    /meetings/:id/chat?scope=room    chat chung, bỏ tin của hộp tài liệu
```

Sự kiện Socket.IO: `document_added`, `document_updated`, `document_removed`, `document_notes_synced`, và `new_chat_message` (kèm `document_id` khi tin nhắn thuộc một tài liệu).

## Vai trò trong một cuộc họp

Vai trò hệ thống (`users.role`) chỉ còn quyết định **ai được tạo cuộc họp**: chỉ `ORGANIZER`
mở được cuộc họp mới. Mọi quyền điều hành nằm ở `meeting_participants.role_in_meeting`, nên
một tài khoản `PARTICIPANT` vẫn có thể được cử làm chủ tọa hoặc thư ký của một cuộc họp cụ thể.

Khi tạo cuộc họp, người tạo **chỉ định cả chủ tọa lẫn thư ký** — hai vai này đổi theo từng
cuộc họp nên không gắn cứng vào người lập lịch. Văn phòng khoa lập lịch cho trưởng khoa chủ tọa
và trợ lý khoa làm thư ký là chuyện bình thường. Cuộc họp bắt buộc phải có đúng một chủ tọa và
đúng một thư ký; cả hai được ghi thành hàng trong `meeting_participants`.

Người tạo luôn nằm trong thành phần tham dự (làm thành viên nếu không tự nhận vai nào) và giữ
vai trò **người lập lịch**: sửa được giờ giấc, phòng, thành phần và đổi người giữ vai — nhưng
**chỉ tới khi cuộc họp bắt đầu**. Sau thời điểm đó cuộc họp thuộc về chủ tọa; người lập lịch
không bao giờ được điều hành nội dung (biểu quyết, chương trình, biên bản).

Chủ tọa là **tập cha** của thư ký: thư ký phụ trách phần hành chính thường ngày, còn chủ tọa
làm thay được khi thư ký vắng nên cuộc họp không bao giờ đứng bánh. Chiều ngược lại thì không —
thư ký không với sang phần điều hành của chủ tọa.

| Việc | Chủ tọa | Thư ký | Thành viên |
|---|:---:|:---:|:---:|
| Sửa / huỷ cuộc họp, bắt đầu – kết thúc, bật tắt phòng trực tuyến | ✓ | | |
| Cấp / thu quyền phát biểu, mời phát biểu, đổi chế độ điều hành | ✓ | | |
| Điều hành chương trình (`PUT /agenda/:id/current`, `/done`) | ✓ | | |
| Trình chiếu tài liệu, chuyển trang, duyệt / từ chối tài liệu | ✓ | | |
| Tạo, mở, chốt biểu quyết | ✓ | | |
| Trao quyền chủ tọa, chỉ định thư ký | ✓ | | |
| Sửa lịch, thành phần, đổi người giữ vai **trước giờ họp** | ✓ | | ✓ nếu là người tạo |
| Ban hành biên bản, gỡ chữ ký | ✓ | | |
| Mời / gỡ người tham dự, đổi quyền chia sẻ và gửi tài liệu | ✓ | ✓ | |
| Soạn chương trình nghị sự trước họp | ✓ | ✓ | |
| Điểm danh thủ công | ✓ | ✓ | |
| Giao, sửa, xoá nhiệm vụ | ✓ | ✓ | |
| Đăng tài liệu không cần duyệt, ghi chú chung, soạn biên bản, ký số, xem nhật ký | ✓ | ✓ | |
| Gửi tài liệu (chờ duyệt), biểu quyết, chat, giơ tay, tự điểm danh | ✓ | ✓ | ✓ |

Quy tắc lập lịch nằm ở `isMeetingScheduler()`; toàn bộ còn lại gom vào `buildMeetingPermissions()` trong
[`backend/src/modules/meetings/meetingAccess.js`](backend/src/modules/meetings/meetingAccess.js).
API `GET /meetings/:id` và `GET /meetings/:id/live-config` trả kèm đối tượng `permissions`, nên
web và mobile chỉ hỏi "tôi được làm gì" chứ không tự suy từ vai trò.

### Ai thấy được phần chưa công bố

Tài liệu còn chờ duyệt, biên bản còn là bản nháp và nhiệm vụ giao cho người khác chỉ hiện với
**chủ tọa, thư ký và quản trị viên**. Thành viên thường thấy tài liệu đã duyệt, biên bản đã ban
hành và nhiệm vụ của chính mình.

Điều kiện này xét theo vai trò **trong cuộc họp**, không phải vai trò toàn cục của tài khoản —
`canSeeFullMeetingRecord()` trong `meetingAccess.js`. Thư ký hoàn toàn có thể là một tài khoản
`PARTICIPANT`; nếu xét theo vai trò toàn cục thì chính người giao nhiệm vụ lại không thấy được
nhiệm vụ mình vừa giao, và người soạn biên bản không mở lại được bản nháp của mình.

### Điều hành lượt phát biểu

Cuộc họp có cờ `speaker_mode`:

- `FREE` — ai cũng tự bật mic (mặc định, hợp với họp nội bộ vài người).
- `MODERATED` — mặc định tắt mic tất cả **ngay từ lúc tạo cuộc họp**; ai muốn nói thì giơ tay,
  chủ tọa thấy **hàng đợi xếp theo thời điểm giơ tay** (`meeting_participants.hand_raised_at`)
  và bấm *Mời phát biểu*. Hệ thống bật mic người được mời, thu mic người trước đó và ghi lại ở
  `meetings.current_speaker_id`.

```text
PUT /meetings/:id/chairman                  trao quyền chủ tọa cho người khác
PUT /meetings/:id/speaker-mode              đổi giữa FREE và MODERATED
PUT /meetings/:id/speaker                   mời phát biểu (userId = null để thu lượt)
PUT /meetings/:id/participants/:userId/speak    cấp / thu quyền nói (chủ tọa)
PUT /meetings/:id/participants/:userId/role     chỉ định thư ký (chủ tọa)
PUT /meetings/:id/participants/:userId/permissions  quyền chia sẻ, gửi tài liệu (thư ký)
```

Sự kiện Socket.IO kèm theo: `speaker_mode_updated`, `speaker_updated`,
`speak_permission_updated`, `chairman_changed`.


**Quyền phát biểu phải đẩy sang cả máy chủ video.** Vé LiveKit được cấp lúc vào phòng và ghi
cứng "được phát" hay không; máy chủ video tự chấp hành theo vé đó. Vì vậy sửa mỗi cơ sở dữ
liệu là chưa đủ — người vừa được chủ tọa mời bấm mic vẫn bị LiveKit từ chối vì vé trong tay
họ vẫn ghi `canPublish: false`. Ba chỗ đổi lượt phát biểu (`PUT /:id/speaker`,
`PUT /:id/speaker-mode`, `PUT /:id/participants/:userId/speak`) đều gọi
`syncLiveRoomPermissions()` để đẩy quyền mới sang LiveKit; máy chủ video cập nhật ngay cho
người đang kết nối, không phải thoát ra vào lại phòng.

Hàm này **không ném lỗi ra ngoài**: cơ sở dữ liệu mới là nguồn sự thật và lần vào phòng sau vé
sẽ được cấp đúng, nên LiveKit chết hay người đó chưa vào phòng thì việc chỉ định vẫn thành công.
Backend gọi LiveKit qua `LIVEKIT_HOST_URL` (mặc định `http://localhost:7880`) — khác
`LIVEKIT_WS_URL` vốn dành cho trình duyệt.
## Điểm danh và biểu quyết

Điểm danh có 3 cách ghi nhận, đều lưu chung một trạng thái `PRESENT / LATE / ABSENT`:

- Người dự tự bấm `Điểm danh` khi cuộc họp đang diễn ra (`MANUAL`).
- Tự động khi vào phòng họp trên hệ thống (`JOIN_ROOM`).
- Thư ký ghi nhận thủ công (có mặt / đi muộn / vắng).

Vào sau giờ bắt đầu quá 10 phút thì hệ thống ghi nhận là **đi muộn** thay vì có mặt; ai không vào thì giữ nguyên **vắng mặt**. Trang chi tiết và phòng họp đều hiển thị dải số liệu Có mặt / Đi muộn / Chưa điểm danh / Tỉ lệ tham dự kèm hình thức và thời gian điểm danh của từng người.

Biểu quyết đi theo vòng đời `DRAFT → OPEN → CLOSED`:

- Chủ tọa soạn trước ở dạng **nháp** rồi mở lấy ý kiến đúng lúc cần (hoặc bấm `Tạo & mở lấy ý kiến` để làm luôn một bước). Khi mở, mọi người nhận thông báo.
- Trong lúc phiên còn mở chỉ hiển thị tiến độ `x/y người đã bỏ phiếu` để tránh tâm lý theo số đông; organizer có thể xem kết quả tạm tính.
- Chốt xong hiện phân bố phiếu kèm phần trăm, và hệ thống gửi thông báo kết quả cho cả cuộc họp.
- Hỗ trợ biểu quyết kín (không lưu ai chọn gì) và xoá biểu quyết còn ở dạng nháp.

## Biên bản điện tử: tự sinh, ký số và tra cứu

Đây là phần biến hệ thống từ "họp có upload file" thành "không giấy tờ đúng nghĩa": biên bản sinh ra từ chính dữ liệu cuộc họp, được ký số, và bất kỳ ai cầm bản in đều kiểm chứng được.

### 1. Biên bản tự sinh

`POST /meetings/:id/minutes/generate` đọc toàn bộ dữ liệu đã có trong database rồi ghép thành bản nháp 8 mục:

| Mục | Nguồn dữ liệu |
| --- | --- |
| I. Thông tin chung | bảng `meetings` + `rooms` + chủ tọa, thư ký |
| II. Thành phần tham dự | `meeting_participants` kèm trạng thái điểm danh và tỷ lệ tham dự |
| III. Nội dung chương trình | `agenda_items` theo thứ tự, kèm người trình bày và trạng thái |
| IV. Tài liệu sử dụng | `documents` đã duyệt |
| V. Kết quả biểu quyết | `votes` + `vote_responses`, tự đếm phiếu, tính % và kết luận thông qua / không thông qua |
| VI. Diễn biến thảo luận | `meeting_notes` (ghi chú chung trong phòng họp) |
| VII. Kết luận của chủ tọa | để trống cho người dùng điền |
| VIII. Nhiệm vụ được giao | `meeting_tasks` kèm người nhận và hạn |

Quy ước tính kết quả biểu quyết: phiếu tán thành quá bán số phiếu đã bỏ thì kết luận **Thông qua**. Phần nghị quyết rút gọn lưu riêng ở cột `minutes.decisions` để tra cứu nhanh.

Mã nguồn: [`backend/src/modules/minutes/minutes.generator.js`](backend/src/modules/minutes/minutes.generator.js).

### 2. Ký số và kiểm tra toàn vẹn

Quy trình bắt buộc: **tự sinh → rà soát, bổ sung kết luận → ký số → ban hành**. Chưa ký thì `PUT /minutes/:id/publish` trả lỗi, và đã ký thì nội dung bị khoá, muốn sửa phải gỡ chữ ký (thao tác gỡ được ghi vào nhật ký).

Cơ chế kỹ thuật ([`minutes.signing.js`](backend/src/modules/minutes/minutes.signing.js)):

1. **Chuẩn hoá nội dung** thành một chuỗi duy nhất (canonical form) gồm mã cuộc họp, mã biên bản, nội dung, kết luận, nghị quyết — bỏ khác biệt về xuống dòng và khoảng trắng cuối dòng để cùng một biên bản luôn cho ra cùng một kết quả.
2. **Băm SHA-256** chuỗi đó → "vân tay" 64 ký tự hex của biên bản.
3. **Ký RSA-2048 (RSA-SHA256)**: mỗi người ký có một cặp khoá sinh tự động ở lần ký đầu tiên (bảng `user_signing_keys`), chữ ký lưu base64 trong `minutes_signatures` kèm vân tay tại thời điểm ký.
4. **Kiểm tra**: băm lại nội dung hiện tại, so với vân tay đã lưu và verify chữ ký bằng khoá công khai. Sai một trong hai là chữ ký không hợp lệ.

Ai được ký: chủ tọa (chức danh *Chủ tọa*) và thư ký (chức danh *Thư ký*) của cuộc họp; thành viên bị từ chối. Ban hành cần ít nhất một chữ ký còn hợp lệ và **người bấm ban hành phải là chủ tọa** — hệ thống không bắt buộc đủ cả hai chữ ký, nhưng ai đã ký thì hiện rõ trong hồ sơ biên bản và trên bản PDF.

**Giới hạn cần nêu trong báo cáo:** khoá riêng sinh tự động và lưu trong database. Hệ thống triển khai thật phải đặt khoá trong USB token hoặc HSM của tổ chức chứng thực số (VNPT-CA, Viettel-CA...); toàn bộ quy trình băm - ký - kiểm tra ở trên giữ nguyên, chỉ thay chỗ giữ khoá.

### 3. Trang tra cứu công khai + QR

Ban hành biên bản sinh mã tra cứu dạng `BB-XXXXXXXX`. Chân trang PDF in mã này kèm QR trỏ tới `/verify/<mã>` — trang công khai **không cần đăng nhập**.

Trang tra cứu trả lời hai câu hỏi: biên bản có thật không, và nội dung có bị sửa sau khi ký không. Chỉ hiển thị siêu dữ liệu (tên cuộc họp, người ký, thời điểm ký, mã băm) — **không hiển thị nội dung biên bản**, để người ngoài không đọc được nội dung cuộc họp chỉ nhờ biết mã.

Kịch bản demo mạnh nhất khi bảo vệ: mở trang tra cứu thấy "biên bản hợp lệ, nội dung còn nguyên vẹn" → vào database sửa trộm một dòng trong bảng `minutes` → tải lại trang tra cứu, hệ thống báo đỏ "nội dung biên bản đã bị thay đổi sau khi ký" và chỉ rõ chữ ký nào hỏng.

```powershell
docker exec paperless-meeting-postgres psql -U paperless -d paperless_meeting -c "UPDATE minutes SET content = content || E'\nDong sua trom' WHERE verification_code = 'BB-XXXXXXXX';"
```

### 4. Xuất PDF tiếng Việt

Trước đây PDFKit dùng font mặc định Helvetica với bảng mã WinAnsi (1 byte/ký tự) nên các chữ như "ả", "ộ", "ệ" bị tách thành 2 ký tự rác. Nay hệ thống nhúng font **DejaVu Serif** (giấy phép tự do, cho phép nhúng và phát hành lại) đặt tại `backend/assets/fonts/`. PDFKit tự tạo subset và bảng ToUnicode nên file chỉ ~37KB mà chữ vẫn bôi đen, copy và tìm kiếm được.

Bố cục PDF theo mẫu văn bản hành chính: quốc hiệu - tiêu ngữ, tiêu đề "BIÊN BẢN CUỘC HỌP", thân bài chia mục, khối chữ ký số hai cột (chức danh - trạng thái hợp lệ - thời điểm ký - họ tên), khung xác thực có QR + mã tra cứu + mã băm, và số trang.

Mã nguồn: [`backend/src/modules/minutes/minutes.pdf.js`](backend/src/modules/minutes/minutes.pdf.js).

### API biên bản

```text
POST   /meetings/:id/minutes/generate   tự sinh nội dung từ dữ liệu cuộc họp
POST   /meetings/:id/minutes            lưu nội dung (khoá lại khi đã có chữ ký)
POST   /minutes/:id/sign                ký số (chủ tọa / thư ký)
DELETE /minutes/:id/signatures          gỡ chữ ký để sửa lại
PUT    /minutes/:id/publish             ban hành, sinh mã tra cứu (bắt buộc đã ký)
GET    /minutes/:id/integrity           trạng thái ký và toàn vẹn
GET    /minutes/:id/pdf                 xuất PDF có chữ ký và QR
GET    /public/minutes/:code            tra cứu công khai, không cần đăng nhập
```

## Trợ lý AI cho tài liệu

Hộp tài liệu trong phòng họp có hai chức năng AI, dùng Claude API qua SDK chính thức `@anthropic-ai/sdk`:

- **Tóm tắt tài liệu** — chủ tọa hoặc thư ký bấm một nút, AI đọc file và rút gọn thành 1-2 câu tổng quan + tối đa 6 gạch đầu dòng nội dung chính, số liệu quan trọng và những điểm cần quyết định. Kết quả lưu vào `documents.ai_summary` nên cả phòng họp đều đọc được, không phải gọi lại API.
- **Hỏi đáp tài liệu** — người dự hỏi bằng tiếng Việt ("chỉ tiêu quý III là bao nhiêu?"), AI trả lời **kèm trích dẫn đoạn văn và số trang** nhờ bật tính năng citations của API. Có trích dẫn thì người dùng kiểm chứng được, tránh việc AI bịa nội dung. Lịch sử hỏi đáp lưu ở bảng `document_questions` và đẩy realtime cho cả phòng.

Cấu hình trong `backend/.env`:

```text
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=claude-opus-5
```

Không đặt khoá thì hai nút AI tự ẩn và API trả thông báo rõ ràng — phần còn lại của hệ thống chạy bình thường.

Chi tiết kỹ thuật đáng nêu trong báo cáo:

- File PDF được gửi thẳng cho mô hình dưới dạng khối `document` (base64), **không cần thư viện bóc tách chữ** — giảm phụ thuộc và tránh lỗi mất dấu tiếng Việt khi trích xuất. Hiện hỗ trợ PDF và văn bản thuần; Word/PowerPoint/Excel cần chuyển sang PDF trước.
- Tóm tắt chạy ở mức suy luận thấp (`effort: low`) cho nhanh và rẻ, hỏi đáp chạy mức trung bình vì cần đọc hiểu sâu hơn.
- Bật sẵn cơ chế dự phòng phía máy chủ: nếu mô hình từ chối trả lời, API tự chạy lại trên mô hình dự phòng trong cùng lời gọi.
- Quyền: tóm tắt giới hạn ở chủ tọa và thư ký (vừa là khâu kiểm duyệt, vừa kiểm soát chi phí gọi API); hỏi đáp mở cho mọi người dự. Mọi lượt gọi AI đều ghi vào nhật ký truy vết.

Mã nguồn: [`backend/src/modules/ai/ai.service.js`](backend/src/modules/ai/ai.service.js).

## Ghi lời nói thành chữ (speech to text)

Cuộc họp nào cũng có phần ý kiến chỉ được **nói ra**, không ai gõ vào chat. Tab **Lời nói**
ghi lại phần đó thành chữ, kèm tên người nói và giờ phút, rồi đưa cho AI tóm tắt cùng với chat.

### Cách làm: nhận dạng ngay trên máy người nói

Người phát biểu bấm **"Ghi lời nói của tôi"**, trình duyệt nhận dạng giọng nói bằng
**Web Speech API** (`vi-VN`) rồi gửi từng câu đã chốt về máy chủ qua
`POST /api/meetings/:id/transcript`. Máy chủ phát lại cho cả phòng bằng socket
(`transcript_segment`) nên mọi người theo được lời nói ngay lúc họp.

Chọn cách này vì ba lý do:

1. **Biết ngay ai nói câu nào.** Mỗi người nhận dạng giọng của chính mình nên không phải
   tách giọng từ luồng audio trộn của cả phòng — việc đó khó và hay sai.
2. **Tiếng nói không rời khỏi máy người dùng**, chỉ có chữ đi qua mạng.
3. **Không phát sinh khoá API hay chi phí theo phút.** Claude chỉ nhận chữ, không có API
   speech-to-text, nên nếu làm phía máy chủ thì phải thêm Whisper/Deepgram.

Đánh đổi phải biết: Web Speech API **chỉ có trên Chrome và Edge** (Firefox, Safari chưa có),
và trình duyệt đòi trang chạy trên **HTTPS hoặc localhost**. Trình duyệt không hỗ trợ thì
nút ghi tự ẩn và hiện một dòng nhắc, các chức năng khác vẫn dùng bình thường.

Cột `source` của bảng `meeting_transcripts` nhận `BROWSER | MOBILE | SERVER | MANUAL`, và
cổng nhận dữ liệu không phụ thuộc nguồn — muốn cắm thêm Whisper phía máy chủ sau này thì chỉ
thêm một nguồn ghi vào, không phải làm lại phần lưu trữ và hiển thị.

### Quyền và độ tin cậy của bản ghi

- Ghi được hay không **gắn với quyền phát biểu**: ở chế độ chủ tọa mời mới được nói, người
  chưa được mời thì lời nói cũng không vào bản ghi — nếu không thì tắt mic mà vẫn ghi được
  là vô nghĩa. Chủ tọa và thư ký luôn ghi được vì họ chịu trách nhiệm về bản ghi.
- **Sửa được đoạn máy nghe sai.** Nhận dạng tiếng Việt sai tên riêng và số liệu là chuyện
  thường, mà đoạn này sẽ đi vào biên bản có ký số. Chủ tọa và thư ký sửa hoặc xoá được; bản
  ghi đánh dấu `is_edited` kèm người sửa nên vẫn phân biệt được chữ máy nghe và chữ người sửa.
  Hai thao tác này vào nhật ký truy vết (`TRANSCRIPT_EDIT`, `TRANSCRIPT_DELETE`).
- Mỗi đoạn được gắn vào **nội dung chương trình đang trình bày**, để biên bản gom ý kiến đúng
  theo từng nội dung.
- Họp xong thì **không ghi thêm** được nhưng **vẫn đọc lại** được, kể cả tải ra file `.txt`.

### AI đọc cả lời nói lẫn chat

`summarizeDiscussion()` trộn hai nguồn thành **một dòng thời gian duy nhất**, mỗi dòng có nhãn
`[nói]` hoặc `[chat]`, thay vì tóm tắt riêng rồi ghép — làm vậy thì cùng một ý bị kể hai lần và
không thấy được ai đáp lại ai. Nhãn cũng cho mô hình biết dòng nào là chữ máy nghe: prompt dặn
rõ khi một nội dung xuất hiện ở cả hai nơi thì tin theo `[chat]`, và chỗ nghe không rõ nghĩa
thì bỏ qua chứ không đoán thành số liệu.

Kết quả rất khá với số đọc thành chữ: "bốn mươi máy" ra `40 máy`, "sáu trăm triệu" ra
`600.000.000 đồng`, "một tỷ hai" ra `1,2 tỷ đồng`.

Bản tóm tắt vào mục VI của biên bản, có ghi rõ nguồn — `ai_summary_source` nhận
`SPEECH | CHAT | BOTH` và biên bản in "(Bản nháp do AI tổng hợp từ N lượt phát biểu được ghi
âm chuyển chữ và M ý kiến trao đổi — thư ký cần rà soát trước khi ký.)"

### Trên điện thoại

App mobile **đọc** được bản ghi, cả lúc đang họp (theo socket) và sau khi họp xong. Việc bật
micro để ghi thì làm trên web: nhận dạng giọng nói trên React Native cần thư viện native
(`@react-native-voice/voice`) nên phải dev build, Expo Go không có sẵn.

### API

| Method | Đường dẫn | Ai dùng được |
|---|---|---|
| `GET` | `/api/meetings/:id/transcript` | ai có quyền xem cuộc họp |
| `POST` | `/api/meetings/:id/transcript` | người đang được phát biểu, chủ tọa, thư ký |
| `PUT` | `/api/transcript/:id` | chủ tọa, thư ký |
| `DELETE` | `/api/transcript/:id` | chủ tọa, thư ký |

## AI tổng hợp thảo luận thành biên bản

Bộ **tự sinh biên bản** (`POST /meetings/:id/minutes/generate`) lắp ráp bảy mục từ dữ liệu có
cấu trúc trong database — thành phần, điểm danh, chương trình, tài liệu, số phiếu biểu quyết,
nhiệm vụ. Không dùng AI nên số liệu luôn chính xác.

Riêng **mục VI. Diễn biến và ý kiến thảo luận** thì không lắp ráp được: ý kiến nằm trong chat
dạng văn xuôi. Trước đây mục này để trống chờ thư ký tự gõ. Nay có AI dựng bản nháp:

```text
POST /meetings/:id/public-notes/ai-summary     AI đọc chat phòng họp, dựng bản nháp
```

Luồng làm việc:

1. Chủ tọa hoặc thư ký bấm **AI tổng hợp thảo luận** trong tab Biên bản.
2. AI đọc toàn bộ chat chung của phòng (bỏ thảo luận trong hộp tài liệu), lấy chương trình
   nghị sự làm ngữ cảnh, rồi trả về bốn phần: *các nội dung đã trao đổi*, *điểm đã thống nhất*,
   *điểm còn ý kiến khác nhau*, *việc cần làm tiếp*.
3. Kết quả lưu ở `meeting_notes.ai_summary` — **tách riêng** khỏi `content` (ghi chú chung do
   người viết), kèm model và số ý kiến đã đọc.
4. Thư ký đọc lại rồi bấm **Dùng làm ghi chú chung**; từ đó bộ sinh biên bản mới lấy vào mục VI.

Nguyên tắc: AI chỉ ra **bản nháp**, người ký chịu trách nhiệm. Biên bản có ký số và giá trị
pháp lý nên không để AI ghi thẳng. Nếu ghi chú chung còn trống mà đã có bản nháp AI, biên bản
tự sinh sẽ dùng bản nháp đó nhưng in kèm dòng ghi rõ nguồn để người ký biết phải rà soát.

Mọi lần gọi AI đều ghi vào nhật ký truy vết (`MINUTES_AI_DISCUSSION`). Lỗi phía Anthropic
(khoá sai, hết hạn mức, quá giới hạn gọi, mất mạng) được đổi thành thông báo tiếng Việt
chỉ rõ cách khắc phục thay vì đẩy nguyên JSON của nhà cung cấp ra giao diện.

## Trang chi tiết cuộc họp

Mở bằng icon con mắt ở danh sách cuộc họp. Đây là hồ sơ đầy đủ của một cuộc họp, ai có
quyền xem cũng mở được — quản trị viên, người lập lịch, chủ tọa, thư ký và cả thành viên
thường; nội dung giống nhau, chỉ khác ở những nút thao tác mà máy chủ cho phép.

Tab **Tổng quan** mở đầu bằng bảng "Những gì đã chốt khi lập lịch": giờ bắt đầu — kết thúc,
thời lượng, nơi họp, hình thức, trạng thái, chủ tọa, thư ký, người lập lịch, chế độ phát
biểu, thời điểm tạo, kèm số tài liệu / nội dung chương trình / biểu quyết / nhiệm vụ và
tình trạng biên bản. Mô tả, ghi chú lúc lập lịch và chương trình dự kiến nằm ngay bên dưới,
nên **cuộc họp chưa diễn ra vẫn xem được trọn vẹn những gì đã đặt từ lúc tạo**. Bảng thành
phần tham dự nằm ở panel tiếp theo.

Tab **Ý kiến** là nơi đọc lại toàn bộ thảo luận chung của phòng họp, cùng bản tổng hợp của
AI và ghi chú chung của thư ký nếu đã có. Tab này đọc bằng REST nên xem lại được cả sau khi
cuộc họp kết thúc và phòng realtime đã đóng. Trao đổi gắn với từng tài liệu vẫn nằm ở tab
Tài liệu.

Các tab còn lại: Tài liệu, Chương trình, Điểm danh, Biểu quyết, Biên bản, Nhiệm vụ, và
Nhật ký (chỉ chủ tọa / thư ký).

Vì chủ tọa hay thư ký có thể là một tài khoản `PARTICIPANT`, danh bạ để mời thêm người và
danh sách phòng họp không lấy từ `/users` và `/rooms` (hai cổng đó chỉ mở cho ADMIN và
ORGANIZER) mà từ `GET /api/meetings/:id/scheduling-options` — giới hạn đúng trong phạm vi
một cuộc họp, trả về `{ rooms, invitableUsers }` và chỉ mở cho người có quyền sắp thành
phần hoặc sửa lịch.

## Hồ sơ tài liệu sau khi họp xong

Đúng tinh thần không giấy tờ, **tài liệu không biến mất khi cuộc họp kết thúc**. Phòng họp
trực tiếp đóng lại (realtime, video, điểm danh), nhưng hồ sơ tài liệu vẫn mở trong tab
**Tài liệu** của trang chi tiết cuộc họp: xem nội dung, tải về, đọc lại thảo luận của từng
tài liệu, ghi chú và tóm tắt AI đều còn nguyên.

Tab này dùng chung hộp làm việc `DocumentWorkspace` với phòng họp nhưng chạy hoàn toàn bằng
REST nên không phụ thuộc socket. Chỉ có hai việc bị khoá sau khi họp xong: **đăng thêm tài
liệu** và **duyệt / từ chối** — hồ sơ đã khép thì không nhận thêm nội dung mới.

## Nhật ký truy vết

Bảng `audit_logs` ghi lại mọi thao tác chạm vào dữ liệu nhạy cảm: ai làm, làm gì, trên đối tượng nào, thuộc cuộc họp nào, lúc nào, từ địa chỉ IP và trình duyệt nào. Tên người thao tác được lưu kèm ngay tại thời điểm ghi nên nhật ký vẫn đọc được sau khi tài khoản bị xoá.

Hiện có **29 điểm ghi log** trên 7 nhóm nghiệp vụ:

| Nhóm | Hành động được ghi |
| --- | --- |
| Tài khoản | đăng nhập, **đăng nhập thất bại** (phát hiện dò mật khẩu), tạo/sửa/xoá tài khoản |
| Cuộc họp | tạo, sửa, bắt đầu, kết thúc, huỷ, xoá, bật/tắt phòng trực tuyến, thêm/gỡ người dự |
| Tài liệu | đăng, **xem**, **tải về**, duyệt, từ chối, xoá, trình chiếu, tóm tắt AI, hỏi AI |
| Điểm danh | tự điểm danh, chủ tọa ghi nhận |
| Biểu quyết | tạo, mở, bỏ phiếu, chốt, xoá |
| Biên bản | lưu, tự sinh, ký số, ban hành, xuất PDF, tra cứu công khai |

Biểu quyết kín chỉ ghi nhận "đã bỏ phiếu", **không lưu lựa chọn** vào nhật ký — bảo toàn tính ẩn danh.

Giao diện: quản trị viên vào `Nhật ký truy vết` ở menu bên trái, có lọc theo nhóm hành động, hành động cụ thể, khoảng thời gian, từ khoá; hành động nhạy cảm (tải tài liệu, xoá, ký số, đăng nhập sai) được tô màu cảnh báo; xuất CSV để lưu hồ sơ. Chủ tọa xem được nhật ký riêng của cuộc họp mình phụ trách ở tab `Nhật ký` trong trang chi tiết.

```text
GET /audit-logs?group=DOCUMENT&from=2026-09-01&q=tải     nhật ký toàn hệ thống (ADMIN)
GET /audit-logs/summary                                   thống kê nhanh
GET /meetings/:id/audit-logs                              nhật ký một cuộc họp (chủ tọa)
```

Mã nguồn: [`backend/src/modules/audit/audit.service.js`](backend/src/modules/audit/audit.service.js).

## Thông báo (web + mobile)

- Backend lưu thông báo trong bảng `notifications` và đẩy realtime qua Socket.IO tới room riêng `user:<id>` của từng người, nên người dùng nhận được thông báo ở mọi màn hình chứ không chỉ trong phòng Live.
- Web: `ToastProvider` hiện toast ở góc phải trên, `NotificationBell` trên thanh trên cùng hiển thị số chưa đọc, trang `/{role}/notifications` cho phép lọc, đánh dấu đã đọc và xoá.
- Mobile: app mở một kết nối Socket.IO dùng chung cho cả thông báo lẫn phòng họp (`useSocket` trong `mobile/src/realtime.js`), nhận thẳng sự kiện `notification:new`; vẫn giữ một nhịp polling 60 giây làm lưới an toàn khi mất sóng. Thông báo mới hiện toast góc phải trên, tab `Thông báo` có badge số chưa đọc.
- Loại thông báo có thêm `MEETING_ONLINE_ENABLED` / `MEETING_ONLINE_DISABLED` khi organizer bật hoặc tắt phòng họp trực tuyến.
- API: `GET /notifications`, `GET /notifications/unread-count`, `PUT /notifications/:id/read`, `PUT /notifications/read-all`, `DELETE /notifications/:id`, `DELETE /notifications/read`.

## Phòng họp video LiveKit (self-host)

Phòng họp video chạy hoàn toàn trên máy của bạn bằng LiveKit server (mã nguồn mở), khởi động cùng docker-compose:

```powershell
docker compose up -d livekit
```

Cách hoạt động:

- Organizer bật / tắt phòng video bằng API `PUT /meetings/:id/online-room` với body `{ "enabled": true }`. Bật cho cuộc họp `OFFLINE` sẽ chuyển thành `HYBRID` và tạo phòng LiveKit; tắt thì quay lại `OFFLINE`. Cuộc họp `ONLINE` luôn có phòng video nên không tắt được.
- Backend tự sinh access token LiveKit cho từng người trong API `GET /meetings/:id/live-config` (quyền publish mic/camera/share màn hình lấy từ quyền của người tham dự trong cuộc họp; chủ tọa là room admin).
- Web nhúng phòng họp trực tiếp trong trang Live bằng `@livekit/components-react`.
- Mobile nhúng phòng họp ngay trong app bằng `@livekit/react-native` (bật/tắt mic, camera, đổi ống kính trước/sau, chia sẻ màn hình, phóng to toàn màn hình). Module này là native nên Expo Go không nạp được — khi đó app tự chuyển sang mở trang `/join/:meetingId` của frontend bằng trình duyệt, token đính kèm trong URL nên không cần đăng nhập lại. Muốn có video ngay trong app thì build theo [`mobile/README.md`](mobile/README.md).

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

## Xem database bằng giao diện web (dùng khi bảo vệ đồ án)

Khi cần chiếu màn hình cho thầy cô xem dữ liệu thật đang nằm trong database — các bảng, các dòng, khoá ngoại, sơ đồ quan hệ — dự án có sẵn hai công cụ chạy bằng Docker, **không phải cài gì thêm trên máy**.

Hai dịch vụ này nằm trong profile `tools` nên không tự chạy cùng `docker compose up -d postgres`; chỉ bật khi cần:

```powershell
docker compose --profile tools up -d adminer pgadmin
```

Bật xong mở trình duyệt:

| Công cụ | Địa chỉ | Dùng khi nào |
| --- | --- | --- |
| Adminer | <http://localhost:8080> | Xem nhanh bảng và dữ liệu, giống phpMyAdmin. Nhẹ, mở tức thì. |
| pgAdmin 4 | <http://localhost:8081> | Đầy đủ hơn, có **sơ đồ quan hệ ERD** để trình bày thiết kế CSDL. |

Tắt khi không dùng nữa (database vẫn chạy bình thường):

```powershell
docker compose --profile tools stop adminer pgadmin
```

### Adminer — xem bảng kiểu phpMyAdmin

Mở <http://localhost:8080>, đăng nhập:

```text
System:   PostgreSQL      <-- phải đổi, mặc định form đang chọn MySQL
Server:   postgres        (đã điền sẵn, là tên service trong Docker)
Username: paperless
Password: paperless
Database: paperless_meeting
```

Sau khi vào: cột trái là danh sách toàn bộ bảng (`meetings`, `meeting_participants`, `votes`, `attendance`, `notifications`...). Bấm tên bảng để xem cấu trúc cột, bấm **Select data** để xem dữ liệu dạng bảng, bấm **SQL command** để chạy câu lệnh bất kỳ.

Kịch bản demo gợi ý: mở bảng `meetings` → bấm nút *Bật phòng trực tuyến* trên web → quay lại Adminer bấm refresh → thầy cô thấy `meeting_type` đổi từ `OFFLINE` sang `HYBRID` và cột `online_room_name`, `online_enabled_at` được điền. Làm tương tự với bảng `meeting_participants` khi demo điểm danh (`attendance_status`, `attendance_method`, `checked_in_at`), và bảng `vote_responses` khi demo biểu quyết.

### pgAdmin 4 — kèm sơ đồ quan hệ ERD

Mở <http://localhost:8081> là vào thẳng giao diện, **không phải đăng nhập** (đã bật sẵn chế độ desktop). Kết nối tới database cũng khai báo sẵn trong `scripts/pgadmin-servers.json` nên cột trái hiện ngay server **Paperless Meeting**.

Lần đầu bấm mở server, pgAdmin hỏi mật khẩu database — nhập `paperless` và tick *Save password* để những lần sau không hỏi lại.

Đường dẫn tới dữ liệu: `Servers > Paperless Meeting > Databases > paperless_meeting > Schemas > public > Tables`. Chuột phải một bảng chọn **View/Edit Data > All Rows** để xem dữ liệu dạng bảng.

Để hiện **sơ đồ quan hệ (ERD)** — phần thầy cô hay hỏi khi bảo vệ: chuột phải vào database `paperless_meeting` rồi chọn **ERD For Database**. pgAdmin tự vẽ toàn bộ bảng cùng khoá chính, khoá ngoại và có thể xuất ra ảnh PNG để đưa vào báo cáo.

Lần đầu khởi động pgAdmin mất khoảng 30–60 giây. Nếu trình duyệt báo không kết nối được thì chờ thêm rồi tải lại trang; kiểm tra bằng `docker logs paperless-meeting-pgadmin`.

## Xem dữ liệu trong database bằng dòng lệnh

Ngoài giao diện web ở trên, có thể truy vấn thẳng bằng `psql` trong container `paperless-meeting-postgres` — tiện khi cần kết quả gọn để chụp vào báo cáo. Không cần cài PostgreSQL trên máy.

Thông tin kết nối (khai báo trong `docker-compose.yml`):

```text
Host: localhost      Port: 5432
Database: paperless_meeting
User: paperless      Password: paperless
```

### Cách 1: bộ truy vấn dựng sẵn để demo (khuyên dùng)

File `scripts/db-demo-queries.sql` gom 12 nhóm truy vấn theo đúng nghiệp vụ: người dùng, cuộc họp và hình thức họp, thành phần tham dự, thống kê điểm danh, chương trình nghị sự, tài liệu số, biểu quyết, chi tiết phiếu bầu, biên bản, nhiệm vụ, thông báo, chat và lịch sử ra vào phòng.

```powershell
docker exec -i paperless-meeting-postgres psql -U paperless -d paperless_meeting -q < scripts/db-demo-queries.sql
```

Muốn lưu kết quả ra file để đưa vào báo cáo:

```powershell
docker exec -i paperless-meeting-postgres psql -U paperless -d paperless_meeting -q < scripts/db-demo-queries.sql > db-demo.txt
```

### Cách 2: chạy một câu lệnh bất kỳ

```powershell
docker exec paperless-meeting-postgres psql -U paperless -d paperless_meeting -c "SELECT title, meeting_type, status FROM meetings;"
```

Ví dụ hay dùng khi demo tính năng bật phòng trực tuyến — chạy trước và sau khi bấm nút để thấy dữ liệu đổi:

```powershell
docker exec paperless-meeting-postgres psql -U paperless -d paperless_meeting -c "SELECT title, meeting_type, online_room_name, online_enabled_at FROM meetings;"
```

Và khi demo điểm danh:

```powershell
docker exec paperless-meeting-postgres psql -U paperless -d paperless_meeting -c "SELECT u.full_name, mp.attendance_status, mp.attendance_method, mp.checked_in_at FROM meeting_participants mp JOIN users u ON u.id = mp.user_id;"
```

### Cách 3: mở psql tương tác

```powershell
docker exec -it paperless-meeting-postgres psql -U paperless -d paperless_meeting
```

Trong psql:

```text
\dt                 -- liệt kê toàn bộ bảng
\d meetings         -- xem cấu trúc cột và ràng buộc của bảng meetings
\x on               -- đổi sang kiểu hiển thị dọc, dễ đọc khi bảng nhiều cột
\q                  -- thoát
```

Nếu dùng Git Bash trên Windows mà báo lỗi `the input device is not a TTY`, thêm `winpty` ở đầu lệnh:

```bash
winpty docker exec -it paperless-meeting-postgres psql -U paperless -d paperless_meeting
```

### Cách 4: dùng phần mềm cài trên máy

DBeaver hoặc extension **PostgreSQL** của VS Code kết nối được vào `localhost:5432` với database `paperless_meeting`, user/password `paperless`. Nếu chỉ cần xem nhanh thì dùng Adminer / pgAdmin ở mục trên, không phải cài gì.

### Sao lưu / mang dữ liệu demo đi

```powershell
# Xuất toàn bộ database ra file
docker exec paperless-meeting-postgres pg_dump -U paperless -d paperless_meeting > backup.sql

# Nạp lại từ file
docker exec -i paperless-meeting-postgres psql -U paperless -d paperless_meeting < backup.sql
```

### Lệnh Docker hay dùng

```powershell
docker ps                                   # xem container đang chạy
docker logs -f paperless-meeting-postgres   # xem log database
docker logs -f paperless-meeting-livekit    # xem log máy chủ video
docker compose down                         # dừng (giữ nguyên dữ liệu)
docker compose down -v                      # dừng và xoá sạch dữ liệu
```

## Lệnh kiểm tra

```powershell
npm run check
```

Lệnh này kiểm tra backend, build frontend production và export bundle Android bằng Expo.

## Docker

Project dùng Docker cho hai dịch vụ hạ tầng: PostgreSQL (`paperless-meeting-postgres`) và máy chủ video LiveKit (`paperless-meeting-livekit`).

```powershell
docker compose up -d postgres livekit                # bật database + máy chủ video
docker compose --profile tools up -d adminer pgadmin # bật giao diện xem database (tuỳ chọn)
docker compose down                     # dừng, giữ nguyên dữ liệu
docker compose down -v                  # dừng và xoá sạch dữ liệu PostgreSQL
```

Backend, frontend và mobile vẫn chạy bằng Node.js để dễ phát triển và debug. Cách xem dữ liệu bên trong database xem ở mục [Xem database bằng giao diện web](#xem-database-bằng-giao-diện-web-dùng-khi-bảo-vệ-đồ-án).
