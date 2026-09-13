# Paperless Meeting System

Hệ thống phòng họp không giấy tờ theo spec Live, không tích hợp AI Summary.

## Chức năng chính

- Backend Node.js + Express + PostgreSQL, JWT auth, phân quyền Admin, Organizer, Participant.
- Quản lý phòng ban, phòng họp, người dùng, cuộc họp, người tham dự, tài liệu, agenda, điểm danh, biểu quyết, biên bản, task.
- Live Meeting Room bằng Socket.IO: trạng thái online, chat realtime, raise hand, cập nhật agenda/tài liệu/vote/điểm danh/ghi chú chung.
- Trung tâm thông báo cho cả 3 vai trò: mời họp, đổi lịch, huỷ họp, bắt đầu/kết thúc, nhắc lịch trước 15 phút, duyệt tài liệu, mở biểu quyết, ban hành biên bản, giao và cập nhật nhiệm vụ. Thông báo hiện realtime ở góc phải trên (web và mobile) kèm chuông đếm số chưa đọc.
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

- Chủ trì đăng tài liệu thì được duyệt ngay và hiện cho cả phòng. Người tham dự có quyền `can_upload_document` gửi được tài liệu nhưng ở trạng thái chờ duyệt — chỉ chủ trì và chính người gửi nhìn thấy cho tới khi được duyệt.
- Tài liệu mới, duyệt, từ chối, xoá đều đẩy realtime qua Socket.IO nên người đang trong phòng thấy ngay, không phải tải lại trang.
- Cuộc họp `FINISHED` hoặc `CANCELLED` thì hồ sơ khoá lại, không nhận thêm tài liệu.
- Thảo luận trong hộp tài liệu lưu ở bảng `chat_messages` với cột `document_id`, tách khỏi chat chung của phòng họp. Ghi chú của tài liệu nằm ở bảng `document_notes`, chỉ chủ trì và thư ký được sửa, mọi người đọc được.
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
PUT    /documents/:id/notes             lưu ghi chú (chủ trì / thư ký)
GET    /meetings/:id/chat?documentId=   thảo luận của một tài liệu
GET    /meetings/:id/chat?scope=room    chat chung, bỏ tin của hộp tài liệu
```

Sự kiện Socket.IO: `document_added`, `document_updated`, `document_removed`, `document_notes_synced`, và `new_chat_message` (kèm `document_id` khi tin nhắn thuộc một tài liệu).

## Điểm danh và biểu quyết

Điểm danh có 4 cách ghi nhận, đều lưu chung một trạng thái `PRESENT / LATE / ABSENT`:

- Quét mã QR do organizer tạo tại phòng họp.
- Người dự tự bấm `Điểm danh` khi cuộc họp đang diễn ra.
- Tự động khi vào phòng họp trên hệ thống (`JOIN_ROOM`).
- Organizer ghi nhận thủ công (có mặt / đi muộn / vắng).

Vào sau giờ bắt đầu quá 10 phút thì hệ thống ghi nhận là **đi muộn** thay vì có mặt. Trang chi tiết và phòng họp đều hiển thị dải số liệu Có mặt / Đi muộn / Chưa điểm danh / Tỉ lệ tham dự kèm hình thức và thời gian điểm danh của từng người.

Biểu quyết đi theo vòng đời `DRAFT → OPEN → CLOSED`:

- Organizer soạn trước ở dạng **nháp** rồi mở lấy ý kiến đúng lúc cần (hoặc bấm `Tạo & mở lấy ý kiến` để làm luôn một bước). Khi mở, mọi người nhận thông báo.
- Trong lúc phiên còn mở chỉ hiển thị tiến độ `x/y người đã bỏ phiếu` để tránh tâm lý theo số đông; organizer có thể xem kết quả tạm tính.
- Chốt xong hiện phân bố phiếu kèm phần trăm, và hệ thống gửi thông báo kết quả cho cả cuộc họp.
- Hỗ trợ biểu quyết kín (không lưu ai chọn gì) và xoá biểu quyết còn ở dạng nháp.

## Biên bản điện tử: tự sinh, ký số và tra cứu

Đây là phần biến hệ thống từ "họp có upload file" thành "không giấy tờ đúng nghĩa": biên bản sinh ra từ chính dữ liệu cuộc họp, được ký số, và bất kỳ ai cầm bản in đều kiểm chứng được.

### 1. Biên bản tự sinh

`POST /meetings/:id/minutes/generate` đọc toàn bộ dữ liệu đã có trong database rồi ghép thành bản nháp 8 mục:

| Mục | Nguồn dữ liệu |
| --- | --- |
| I. Thông tin chung | bảng `meetings` + `rooms` + chủ trì, thư ký |
| II. Thành phần tham dự | `meeting_participants` kèm trạng thái điểm danh và tỷ lệ tham dự |
| III. Nội dung chương trình | `agenda_items` theo thứ tự, kèm người trình bày và trạng thái |
| IV. Tài liệu sử dụng | `documents` đã duyệt |
| V. Kết quả biểu quyết | `votes` + `vote_responses`, tự đếm phiếu, tính % và kết luận thông qua / không thông qua |
| VI. Diễn biến thảo luận | `meeting_notes` (ghi chú chung trong phòng họp) |
| VII. Kết luận của chủ trì | để trống cho người dùng điền |
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

Ai được ký: chủ trì cuộc họp (chức danh *Chủ trì*) và người có vai trò thư ký (chức danh *Thư ký*). Người dự thường bị từ chối.

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
POST   /minutes/:id/sign                ký số (chủ trì / thư ký)
DELETE /minutes/:id/signatures          gỡ chữ ký để sửa lại
PUT    /minutes/:id/publish             ban hành, sinh mã tra cứu (bắt buộc đã ký)
GET    /minutes/:id/integrity           trạng thái ký và toàn vẹn
GET    /minutes/:id/pdf                 xuất PDF có chữ ký và QR
GET    /public/minutes/:code            tra cứu công khai, không cần đăng nhập
```

## Trợ lý AI cho tài liệu

Hộp tài liệu trong phòng họp có hai chức năng AI, dùng Claude API qua SDK chính thức `@anthropic-ai/sdk`:

- **Tóm tắt tài liệu** — chủ trì hoặc thư ký bấm một nút, AI đọc file và rút gọn thành 1-2 câu tổng quan + tối đa 6 gạch đầu dòng nội dung chính, số liệu quan trọng và những điểm cần quyết định. Kết quả lưu vào `documents.ai_summary` nên cả phòng họp đều đọc được, không phải gọi lại API.
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
- Quyền: tóm tắt giới hạn ở chủ trì và thư ký (vừa là khâu kiểm duyệt, vừa kiểm soát chi phí gọi API); hỏi đáp mở cho mọi người dự. Mọi lượt gọi AI đều ghi vào nhật ký truy vết.

Mã nguồn: [`backend/src/modules/ai/ai.service.js`](backend/src/modules/ai/ai.service.js).

## Nhật ký truy vết

Bảng `audit_logs` ghi lại mọi thao tác chạm vào dữ liệu nhạy cảm: ai làm, làm gì, trên đối tượng nào, thuộc cuộc họp nào, lúc nào, từ địa chỉ IP và trình duyệt nào. Tên người thao tác được lưu kèm ngay tại thời điểm ghi nên nhật ký vẫn đọc được sau khi tài khoản bị xoá.

Hiện có **29 điểm ghi log** trên 7 nhóm nghiệp vụ:

| Nhóm | Hành động được ghi |
| --- | --- |
| Tài khoản | đăng nhập, **đăng nhập thất bại** (phát hiện dò mật khẩu), tạo/sửa/xoá tài khoản |
| Cuộc họp | tạo, sửa, bắt đầu, kết thúc, huỷ, xoá, bật/tắt phòng trực tuyến, thêm/gỡ người dự |
| Tài liệu | đăng, **xem**, **tải về**, duyệt, từ chối, xoá, trình chiếu, tóm tắt AI, hỏi AI |
| Điểm danh | tự điểm danh, chủ trì ghi nhận, tạo mã QR |
| Biểu quyết | tạo, mở, bỏ phiếu, chốt, xoá |
| Biên bản | lưu, tự sinh, ký số, ban hành, xuất PDF, tra cứu công khai |

Biểu quyết kín chỉ ghi nhận "đã bỏ phiếu", **không lưu lựa chọn** vào nhật ký — bảo toàn tính ẩn danh.

Giao diện: quản trị viên vào `Nhật ký truy vết` ở menu bên trái, có lọc theo nhóm hành động, hành động cụ thể, khoảng thời gian, từ khoá; hành động nhạy cảm (tải tài liệu, xoá, ký số, đăng nhập sai) được tô màu cảnh báo; xuất CSV để lưu hồ sơ. Chủ trì xem được nhật ký riêng của cuộc họp mình phụ trách ở tab `Nhật ký` trong trang chi tiết.

```text
GET /audit-logs?group=DOCUMENT&from=2026-09-01&q=tải     nhật ký toàn hệ thống (ADMIN)
GET /audit-logs/summary                                   thống kê nhanh
GET /meetings/:id/audit-logs                              nhật ký một cuộc họp (chủ trì)
```

Mã nguồn: [`backend/src/modules/audit/audit.service.js`](backend/src/modules/audit/audit.service.js).

## Thông báo (web + mobile)

- Backend lưu thông báo trong bảng `notifications` và đẩy realtime qua Socket.IO tới room riêng `user:<id>` của từng người, nên người dùng nhận được thông báo ở mọi màn hình chứ không chỉ trong phòng Live.
- Web: `ToastProvider` hiện toast ở góc phải trên, `NotificationBell` trên thanh trên cùng hiển thị số chưa đọc, trang `/{role}/notifications` cho phép lọc, đánh dấu đã đọc và xoá.
- Mobile: app không mở socket mà hỏi API 20 giây một lần (`useNotificationCenter`), thông báo mới hiện toast góc phải trên, tab `Thông báo` có badge số chưa đọc.
- Loại thông báo có thêm `MEETING_ONLINE_ENABLED` / `MEETING_ONLINE_DISABLED` khi organizer bật hoặc tắt phòng họp trực tuyến.
- API: `GET /notifications`, `GET /notifications/unread-count`, `PUT /notifications/:id/read`, `PUT /notifications/read-all`, `DELETE /notifications/:id`, `DELETE /notifications/read`.

## Phòng họp video LiveKit (self-host)

Phòng họp video chạy hoàn toàn trên máy của bạn bằng LiveKit server (mã nguồn mở), khởi động cùng docker-compose:

```powershell
docker compose up -d livekit
```

Cách hoạt động:

- Organizer bật / tắt phòng video bằng API `PUT /meetings/:id/online-room` với body `{ "enabled": true }`. Bật cho cuộc họp `OFFLINE` sẽ chuyển thành `HYBRID` và tạo phòng LiveKit; tắt thì quay lại `OFFLINE`. Cuộc họp `ONLINE` luôn có phòng video nên không tắt được.
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
