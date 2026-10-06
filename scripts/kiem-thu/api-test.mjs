// Kiểm thử hộp đen mức API (57 ca của Chương 5, TC56 chạy trên giao diện).
//   npm run test:api
// Cần backend ở cổng 4000 và container paperless-meeting-postgres đang chạy.
// Kịch bản tự tạo tài khoản và cuộc họp riêng rồi xoá sạch khi chạy xong, không đụng dữ liệu đang có.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync, spawn } from "child_process";
import { generateFixtures } from "./gen-pdf.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const FILES = path.join(HERE, "files");
const OUT = path.join(HERE, "ket-qua");
const API = process.env.API || "http://localhost:4000/api";
const PASS = "123456";
const ADMIN = process.env.KT_ADMIN || "admin@example.com";
const ORGANIZER = process.env.KT_ORGANIZER || "organizer@example.com";

const results = [];
const timings = {};
const cleanup = { meetings: [], users: [] };

const sql = (q) =>
  execFileSync("docker", [
    "exec", "paperless-meeting-postgres", "psql", "-U", "paperless", "-d",
    "paperless_meeting", "-tAc", q
  ]).toString().trim();

async function call(method, url, { token, body, form, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const t0 = performance.now();
  const res = await fetch(API + url, { method, headers, body: payload });
  const ms = performance.now() - t0;
  if (raw) return { status: res.status, buf: Buffer.from(await res.arrayBuffer()), ms };
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, ms };
}

function record(id, group, name, expected, ok, actual) {
  results.push({ id, group, name, expected, actual, ok: Boolean(ok) });
  console.log(`${ok ? "ĐẠT " : "LỖI "} ${id} [${group}] ${name} -> ${actual}`);
}
const msg = (r) => `HTTP ${r.status}${r.json?.message ? ": " + r.json.message : ""}`;
const decodeJwt = (t) => JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString());

async function login(email) {
  const r = await call("POST", "/auth/login", { body: { email, password: PASS } });
  if (r.status !== 200) throw new Error(`Không đăng nhập được ${email}: ${msg(r)}`);
  return { token: r.json.token, user: r.json.user };
}

function upload(meetingId, token, file, name, type = "application/pdf") {
  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(path.join(FILES, file))], { type }), name);
  return call("POST", `/meetings/${meetingId}/documents`, { token, form });
}

// Tài khoản tạm cho thư ký và hai thành viên, xoá đi khi chạy xong.
async function tempUser(admin, key, fullName) {
  const email = `kiemthu.${Date.now()}.${key}@example.com`;
  const r = await call("POST", "/users", { token: admin.token, body: { fullName, email, password: PASS, role: "PARTICIPANT" } });
  if (r.status !== 201) throw new Error(`Không tạo được tài khoản tạm: ${msg(r)}`);
  cleanup.users.push(r.json.data.id);
  return login(email);
}

async function main() {
  if (!fs.existsSync(path.join(FILES, "qua-lon-21mb.pdf"))) await generateFixtures(FILES);
  const admin = await login(ADMIN);
  const org = await login(ORGANIZER); // người tổ chức kiêm chủ tọa
  const sec = await tempUser(admin, "thuky", "Thư ký kiểm thử");
  const m1 = await tempUser(admin, "tv1", "Thành viên kiểm thử 1");
  const m2 = await tempUser(admin, "tv2", "Thành viên kiểm thử 2");
  const rooms = ((await call("GET", "/rooms", { token: org.token })).json?.data || [])
    .filter((r) => r.status === "AVAILABLE" && !/trực tuyến/i.test(r.name));

  // ---------- Xác thực ----------
  let r = await call("POST", "/auth/login", { body: { email: ADMIN, password: PASS } });
  record("TC01", "Xác thực", "Đăng nhập đúng mật khẩu", "HTTP 200, trả về JWT",
    r.status === 200 && r.json.token?.split(".").length === 3, `HTTP ${r.status}, JWT ${r.json.token ? "3 phần" : "không có"}`);
  r = await call("POST", "/auth/login", { body: { email: ADMIN, password: "sai-mat-khau" } });
  record("TC02", "Xác thực", "Đăng nhập sai mật khẩu", "HTTP 401, ghi LOGIN_FAILED", r.status === 401, msg(r));
  r = await call("GET", "/users");
  record("TC03", "Xác thực", "Gọi API không kèm token", "HTTP 401", r.status === 401, msg(r));
  r = await call("GET", "/users", { token: org.token.slice(0, -4) + "abcd" });
  record("TC04", "Xác thực", "Gọi API với token giả mạo", "HTTP 401", r.status === 401, msg(r));
  const email = `kiemthu.${Date.now()}.dangky@example.com`;
  const reg = await call("POST", "/auth/register", { body: { fullName: "Tài khoản tự đăng ký", email, password: PASS } });
  const regId = reg.json?.data?.id || reg.json?.user?.id || sql(`SELECT id FROM users WHERE email='${email}'`);
  if (regId) cleanup.users.push(regId);
  r = await call("POST", "/auth/login", { body: { email, password: PASS } });
  record("TC05", "Xác thực", "Tài khoản tự đăng ký chưa duyệt đăng nhập", "Bị chặn (HTTP 403)",
    reg.status === 201 && r.status === 403, `đăng ký HTTP ${reg.status}, đăng nhập ${msg(r)}`);

  // ---------- Phân quyền ----------
  r = await call("GET", "/users", { token: m1.token });
  record("TC06", "Phân quyền", "Participant truy cập danh sách người dùng", "HTTP 403", r.status === 403, msg(r));
  r = await call("POST", "/meetings", { token: m1.token, body: { title: "x", startTime: new Date().toISOString(), endTime: new Date(Date.now() + 3600e3).toISOString() } });
  record("TC07", "Phân quyền", "Participant tạo cuộc họp", "HTTP 403", r.status === 403, msg(r));
  r = await call("GET", "/audit-logs", { token: org.token });
  record("TC08", "Phân quyền", "Organizer xem nhật ký toàn hệ thống", "HTTP 403 (chỉ ADMIN)", r.status === 403, msg(r));

  // ---------- Cuộc họp ----------
  const base = {
    title: "[Kiểm thử tự động] Họp giao ban kiểm thử",
    description: "Cuộc họp do kịch bản kiểm thử tạo ra, sẽ tự xoá khi chạy xong.",
    startTime: new Date(Date.now() - 15 * 60e3).toISOString(),
    endTime: new Date(Date.now() + 60 * 60e3).toISOString(),
    roomId: rooms[0]?.id, meetingType: "OFFLINE",
    agenda: [{ title: "Báo cáo tiến độ triển khai", durationMinutes: 15 }, { title: "Thảo luận kế hoạch quý IV", durationMinutes: 20 }]
  };
  const roster = [
    { userId: org.user.id, roleInMeeting: "CHAIRMAN" },
    { userId: sec.user.id, roleInMeeting: "SECRETARY" },
    { userId: m1.user.id, roleInMeeting: "MEMBER" },
    { userId: m2.user.id, roleInMeeting: "MEMBER" }
  ];
  r = await call("POST", "/meetings", { token: org.token, body: { ...base, participants: roster.filter((p) => p.roleInMeeting !== "SECRETARY") } });
  record("TC09", "Cuộc họp", "Tạo cuộc họp thiếu thư ký", "HTTP 400 \"phải chỉ định một thư ký\"", r.status === 400 && /thư ký/.test(r.json?.message), msg(r));
  r = await call("POST", "/meetings", { token: org.token, body: { ...base, roomId: null, participants: roster } });
  record("TC10", "Cuộc họp", "Tạo họp tập trung không chọn phòng", "HTTP 400", r.status === 400, msg(r));
  // Thử lần lượt các phòng vật lý, lấy phòng đầu tiên còn trống trong khung giờ.
  for (const room of rooms) {
    r = await call("POST", "/meetings", { token: org.token, body: { ...base, roomId: room.id, participants: roster } });
    if (r.status !== 400 || !/trùng/.test(r.json?.message)) { base.roomId = room.id; break; }
  }
  const meetingId = r.json?.data?.id;
  if (meetingId) cleanup.meetings.push(meetingId);
  record("TC11", "Cuộc họp", "Tạo cuộc họp hợp lệ (chủ tọa, thư ký, chương trình)", "HTTP 201", r.status === 201, `HTTP ${r.status}, meeting_type=${r.json?.data?.meeting_type}`);
  if (!meetingId) throw new Error("Không tạo được cuộc họp kiểm thử, dừng: " + msg(r));
  r = await call("POST", "/meetings", { token: org.token, body: { ...base, title: "[Kiểm thử] trùng phòng", participants: roster } });
  if (r.json?.data?.id) cleanup.meetings.push(r.json.data.id);
  record("TC12", "Cuộc họp", "Tạo cuộc họp trùng phòng, trùng giờ", "HTTP 400 \"đã có lịch trùng\"", r.status === 400 && /trùng/.test(r.json?.message), msg(r));
  r = await call("PUT", `/meetings/${meetingId}/start`, { token: m1.token });
  record("TC13", "Cuộc họp", "Thành viên thường bắt đầu họp", "HTTP 403", r.status === 403, msg(r));
  r = await call("PUT", `/meetings/${meetingId}/start`, { token: org.token });
  record("TC14", "Cuộc họp", "Chủ tọa bắt đầu họp", "Trạng thái ONGOING", r.json?.data?.status === "ONGOING", `HTTP ${r.status}, status=${r.json?.data?.status}`);
  r = await call("PUT", `/meetings/${meetingId}/online-room`, { token: org.token, body: { enabled: true } });
  record("TC15", "Cuộc họp", "Bật phòng trực tuyến cho họp tập trung", "OFFLINE → HYBRID", r.json?.data?.meeting_type === "HYBRID", `HTTP ${r.status}, meeting_type=${r.json?.data?.meeting_type}`);
  await call("PUT", `/meetings/${meetingId}/speaker-mode`, { token: org.token, body: { mode: "MODERATED" } });
  r = await call("GET", `/meetings/${meetingId}/live-config`, { token: m1.token });
  let grant = r.json?.data?.livekitToken ? decodeJwt(r.json.data.livekitToken).video : {};
  record("TC16", "Cuộc họp", "Token LiveKit của thành viên ở chế độ MODERATED", "canPublish = false", r.status === 200 && grant.canPublish === false, `HTTP ${r.status}, canPublish=${grant.canPublish}`);
  const sp = await call("PUT", `/meetings/${meetingId}/speaker`, { token: org.token, body: { userId: m1.user.id } });
  r = await call("GET", `/meetings/${meetingId}/live-config`, { token: m1.token });
  grant = r.json?.data?.livekitToken ? decodeJwt(r.json.data.livekitToken).video : {};
  record("TC17", "Cuộc họp", "Chủ tọa mời thành viên phát biểu", "Token mới có canPublish = true", sp.status === 200 && grant.canPublish === true, `mời HTTP ${sp.status}; token mới canPublish=${grant.canPublish}`);

  // ---------- Điểm danh ----------
  r = await call("POST", `/meetings/${meetingId}/attendance/checkin`, { token: m1.token });
  record("TC18", "Điểm danh", "Tự điểm danh sau giờ bắt đầu 15 phút", "Trạng thái LATE", r.json?.meta?.status === "LATE", `HTTP ${r.status}, status=${r.json?.meta?.status}`);
  r = await call("PUT", `/meetings/${meetingId}/attendance/${m2.user.id}`, { token: sec.token, body: { status: "PRESENT" } });
  const st = sql(`SELECT attendance_status FROM meeting_participants WHERE meeting_id='${meetingId}' AND user_id='${m2.user.id}'`);
  record("TC19", "Điểm danh", "Thư ký ghi nhận điểm danh thủ công", "HTTP 200, PRESENT", r.status === 200 && st === "PRESENT", `HTTP ${r.status}, status=${st}`);

  // ---------- Tài liệu ----------
  r = await upload(meetingId, m2.token, "ke-hoach-chuyen-doi-so.pdf", "Kế hoạch chuyển đổi số quý IV.pdf");
  const pendingDoc = r.json?.data?.id;
  record("TC20", "Tài liệu", "Thành viên gửi tài liệu trong cuộc họp", "HTTP 201, PENDING", r.status === 201 && r.json.data.status === "PENDING", `HTTP ${r.status}, status=${r.json?.data?.status}`);
  r = await call("PUT", `/documents/${pendingDoc}/approve`, { token: m2.token });
  record("TC21", "Tài liệu", "Thành viên tự duyệt tài liệu", "HTTP 403", r.status === 403, msg(r));
  r = await call("PUT", `/documents/${pendingDoc}/approve`, { token: org.token });
  record("TC22", "Tài liệu", "Chủ tọa duyệt tài liệu chờ duyệt", "APPROVED", r.json?.data?.status === "APPROVED", `HTTP ${r.status}, status=${r.json?.data?.status}`);
  r = await upload(meetingId, org.token, "cai-dat.exe", "cai-dat.exe", "application/octet-stream");
  record("TC23", "Tài liệu", "Tải lên tệp .exe", "Từ chối với mã 4xx", r.status >= 400 && r.status < 500, msg(r));
  r = await upload(meetingId, org.token, "bao-cao-tien-do.pdf", "Báo cáo tiến độ quý III.pdf");
  const doc = r.json?.data;
  record("TC24", "Tài liệu", "Chủ tọa đăng PDF tên tiếng Việt", "HTTP 201, APPROVED, giữ đúng dấu",
    r.status === 201 && doc.status === "APPROVED" && doc.original_name === "Báo cáo tiến độ quý III.pdf", `HTTP ${r.status}, status=${doc?.status}, name=${doc?.original_name}`);
  r = await call("GET", `/documents/${doc.id}/download`);
  record("TC25", "Tài liệu", "Tải tài liệu không kèm token", "HTTP 401", r.status === 401, msg(r));
  r = await upload(meetingId, org.token, "qua-lon-21mb.pdf", "qua-lon-21mb.pdf");
  record("TC58", "Tài liệu", "Tải lên PDF 21 MB (giới hạn 20 MB)", "HTTP 413", r.status === 413, msg(r));

  // ---------- Biểu quyết ----------
  r = await call("POST", `/meetings/${meetingId}/votes`, { token: m1.token, body: { title: "x" } });
  record("TC27", "Biểu quyết", "Thành viên tạo biểu quyết", "HTTP 403", r.status === 403, msg(r));
  r = await call("POST", `/meetings/${meetingId}/votes`, { token: org.token, body: { title: "Thông qua kế hoạch mở rộng phòng B202" } });
  const vote = r.json?.data;
  record("TC28", "Biểu quyết", "Chủ tọa tạo biểu quyết nháp", "status = DRAFT", vote?.status === "DRAFT", `HTTP ${r.status}, status=${vote?.status}, options=${JSON.stringify(vote?.options)}`);
  r = await call("POST", `/votes/${vote.id}/responses`, { token: m1.token, body: { answer: "YES" } });
  record("TC29", "Biểu quyết", "Bỏ phiếu khi biểu quyết còn nháp", "Bị từ chối", r.status === 400, msg(r));
  await call("PUT", `/votes/${vote.id}/open`, { token: org.token });
  const v1 = await call("POST", `/votes/${vote.id}/responses`, { token: org.token, body: { answer: "YES" } });
  const v2 = await call("POST", `/votes/${vote.id}/responses`, { token: sec.token, body: { answer: "YES" } });
  const v3 = await call("POST", `/votes/${vote.id}/responses`, { token: m1.token, body: { answer: "NO" } });
  record("TC30", "Biểu quyết", "Ba đại biểu bỏ phiếu khi phiên mở", "HTTP 2xx", [v1, v2, v3].every((x) => x.status === 201), `HTTP ${v1.status}/${v2.status}/${v3.status}`);
  r = await call("POST", `/votes/${vote.id}/responses`, { token: m1.token, body: { answer: "YES" } });
  record("TC31", "Biểu quyết", "Một người bỏ phiếu lần thứ hai", "Bị từ chối, giữ phiếu đầu", r.status === 400, msg(r));
  r = await call("PUT", `/votes/${vote.id}/close`, { token: org.token });
  const tally = Object.fromEntries((r.json?.results || []).map((x) => [x.answer ?? x.option ?? x.label, Number(x.count ?? x.total)]));
  record("TC32", "Biểu quyết", "Chốt biểu quyết và đếm phiếu", "2 tán thành, 1 không tán thành",
    tally.YES === 2 && tally.NO === 1, `HTTP ${r.status}; ${JSON.stringify(tally)}`);

  // ---------- Lời nói, trò chuyện ----------
  r = await call("POST", `/meetings/${meetingId}/transcript`, { token: sec.token, body: { content: "Kinh phí dự kiến cho phòng B202 khoảng một trăm tám mươi triệu đồng.", confidence: 0.91 } });
  record("TC33", "Lời nói", "Thư ký gửi đoạn lời nói đã nhận dạng", "HTTP 201, lưu tên người nói", r.status === 201 && r.json?.data?.speaker_name, `HTTP ${r.status}, speaker=${r.json?.data?.speaker_name}`);
  await call("POST", `/meetings/${meetingId}/transcript`, { token: m1.token, body: { content: "Phòng Công nghệ thông tin đã lắp bốn mươi máy tính bảng ở phòng A101.", confidence: 0.88 } });
  r = await call("POST", `/meetings/${meetingId}/transcript`, { token: m2.token, body: { content: "Tôi xin phát biểu." } });
  record("TC34", "Lời nói", "Thành viên chưa được mời gửi lời nói (MODERATED)", "HTTP 403", r.status === 403, msg(r));
  for (const [who, text] of [
    [org, "Đề nghị phòng CNTT báo cáo tình hình lắp đặt thiết bị."],
    [m1, "Đã lắp 40 máy tính bảng ở A101, kinh phí dùng 420/600 triệu."],
    [sec, "Em đề xuất mở rộng sang phòng B202 trong quý IV."],
    [m2, "Nhất trí, nhưng cần bổ sung tập huấn cho cán bộ trước khi mở rộng."],
    [org, "Thống nhất: tập huấn trong tháng 10, mở rộng B202 từ tháng 11."]
  ]) await call("POST", `/meetings/${meetingId}/chat`, { token: who.token, body: { content: text } });

  // ---------- Nhiệm vụ ----------
  const deadline = new Date(Date.now() + 10 * 86400e3).toISOString().slice(0, 10);
  r = await call("POST", `/meetings/${meetingId}/tasks`, { token: sec.token, body: { assignedTo: m1.user.id, title: "Lập dự toán chi tiết phòng B202", deadline, priority: "HIGH" } });
  record("TC35", "Nhiệm vụ", "Thư ký giao nhiệm vụ cho thành viên", "HTTP 201, TODO", r.status === 201 && r.json?.data?.status === "TODO", `HTTP ${r.status}, status=${r.json?.data?.status}`);

  // ---------- Trợ lý AI (gọi Claude API thật) ----------
  r = await call("POST", `/documents/${doc.id}/summary`, { token: m1.token });
  record("TC48", "AI", "Thành viên thường yêu cầu tóm tắt", "HTTP 403", r.status === 403, msg(r));
  r = await call("POST", `/documents/${doc.id}/summary`, { token: org.token });
  timings.summary = r.ms;
  const summary = r.json?.data?.ai_summary || "";
  const facts = ["40", "420", "600", "B202"].filter((k) => summary.includes(k));
  record("TC49", "AI", "Chủ tọa tóm tắt tài liệu 2 trang", "HTTP 200, đúng số liệu, không markdown",
    r.status === 200 && facts.length === 4 && !/(\*\*|^#)/m.test(summary),
    `HTTP ${r.status}, ${summary.length} ký tự, đủ ${facts.length}/4 số liệu, ${(r.ms / 1000).toFixed(1)} giây, model=${r.json?.data?.ai_summary_model}`);

  const ask = (who, q) => call("POST", `/documents/${doc.id}/ask`, { token: who.token, body: { question: q } });
  const answers = {};
  r = await ask(m1, "Kinh phí đã sử dụng là bao nhiêu và còn lại bao nhiêu?");
  timings.ask = r.ms;
  answers.budget = r.json?.data;
  let cites = r.json?.data?.citations || [];
  record("TC50", "AI", "Hỏi kinh phí trong tài liệu", "Trả lời đúng 420 triệu, có trích dẫn số trang",
    r.status === 201 && /420/.test(r.json?.data?.answer) && cites.length > 0,
    `HTTP ${r.status}, ${cites.length} trích dẫn, trang ${cites.map((c) => c.startPage).join(",")}, ${(r.ms / 1000).toFixed(1)} giây`);
  r = await ask(m2, "Tài liệu có nêu tên nhà cung cấp máy tính bảng không?");
  timings.askNone = r.ms;
  answers.vendor = r.json?.data;
  record("TC51", "AI", "Hỏi nội dung không có trong tài liệu", "Nói rõ tài liệu không đề cập",
    r.status === 201 && /không (đề cập|có thông tin|nêu)/i.test(r.json?.data?.answer), `HTTP ${r.status}: "${(r.json?.data?.answer || "").slice(0, 90)}…"`);
  r = await ask(sec, "Phòng B202 dự kiến hoàn thành lắp đặt khi nào?");
  answers.b202 = r.json?.data;
  cites = r.json?.data?.citations || [];
  record("TC55", "AI", "Số trang trích dẫn khi nội dung nằm ở trang 2", "startPage = endPage = 2",
    cites.length > 0 && cites.every((c) => c.startPage === 2 && c.endPage === 2),
    `HTTP ${r.status}, trích dẫn: ${cites.map((c) => `${c.startPage}–${c.endPage}`).join(", ") || "không có"}`);
  r = await call("GET", `/documents/${doc.id}/questions`, { token: m2.token });
  const qs = r.json?.data || [];
  record("TC52", "AI", "Lịch sử hỏi đáp xem được bởi người dự", "Có đủ 3 câu vừa hỏi", r.status === 200 && qs.length >= 3, `HTTP ${r.status}, ${qs.length} câu hỏi`);
  const withCites = qs.filter((q) => (typeof q.citations === "string" ? JSON.parse(q.citations) : q.citations || []).length > 0);
  record("TC57", "AI", "Trích dẫn được lưu, xem lại sau khi tải lại", "Lịch sử trả kèm trích dẫn",
    withCites.length >= 2, `HTTP ${r.status}, ${withCites.length}/${qs.length} câu có trích dẫn`);
  r = await call("POST", `/meetings/${meetingId}/public-notes/ai-summary`, { token: m1.token });
  record("TC53", "AI", "Thành viên thường yêu cầu tổng hợp thảo luận", "HTTP 403", r.status === 403, msg(r));
  r = await call("POST", `/meetings/${meetingId}/public-notes/ai-summary`, { token: sec.token });
  timings.discussion = r.ms;
  const disc = r.json?.data?.ai_summary || "";
  const heads = [/1\.\s/, /2\.\s/, /3\.\s/, /4\.\s/].filter((re) => re.test(disc)).length;
  record("TC54", "AI", "Thư ký yêu cầu AI tổng hợp thảo luận", "Đủ 4 đề mục, nguồn lời nói + tin nhắn",
    r.status === 200 && heads === 4 && r.json.data.ai_summary_source === "BOTH",
    `HTTP ${r.status}, ${heads}/4 đề mục, nguồn=${r.json?.data?.ai_summary_source}, ${r.json?.data?.ai_summary_message_count} tin nhắn, ${r.json?.data?.ai_summary_speech_count} đoạn lời nói, ${(r.ms / 1000).toFixed(1)} giây`);
  fs.writeFileSync(path.join(OUT, "ai-dau-ra.json"), JSON.stringify({ summary, answers, discussion: disc }, null, 2));
  await call("PUT", `/meetings/${meetingId}/public-notes`, { token: sec.token, body: { content: "- Đã lắp đặt 40 máy tính bảng tại A101.\n- Thống nhất tập huấn trong tháng 10, mở rộng phòng B202 từ tháng 11." } });

  // ---------- Biên bản ----------
  await call("PUT", `/meetings/${meetingId}/finish`, { token: org.token });
  r = await call("POST", `/meetings/${meetingId}/minutes/generate`, { token: sec.token });
  const minutes = r.json?.data;
  const sections = ["I.", "II.", "III.", "IV.", "V.", "VI.", "VII."].filter((s) => minutes?.content?.includes(s + " ")).length;
  record("TC36", "Biên bản", "Thư ký tự sinh biên bản", "Đủ 7 mục I–VII, số liệu khớp",
    r.status === 200 && sections === 7, `HTTP ${r.status}; ${sections}/7 mục; thống kê ${JSON.stringify(r.json?.meta || {})}`);
  await call("PUT", `/minutes/${minutes.id}`, { token: sec.token, body: { content: minutes.content, conclusion: "Thông qua kế hoạch mở rộng phòng B202." } });
  r = await call("PUT", `/minutes/${minutes.id}/publish`, { token: org.token });
  record("TC37", "Biên bản", "Ban hành biên bản chưa ký", "HTTP 400", r.status === 400, msg(r));
  r = await call("POST", `/minutes/${minutes.id}/sign`, { token: m1.token });
  record("TC38", "Biên bản", "Thành viên thường ký biên bản", "HTTP 403", r.status === 403, msg(r));
  const s1 = await call("POST", `/minutes/${minutes.id}/sign`, { token: org.token });
  const s2 = await call("POST", `/minutes/${minutes.id}/sign`, { token: sec.token });
  record("TC39", "Biên bản", "Chủ tọa và thư ký ký số", "HTTP 2xx, RSA-SHA256", s1.status === 200 && s2.status === 200, `HTTP ${s1.status}/${s2.status}`);
  r = await call("PUT", `/minutes/${minutes.id}`, { token: sec.token, body: { content: minutes.content + "\nSửa thêm." } });
  record("TC40", "Biên bản", "Sửa nội dung biên bản đã ký", "Bị khoá (HTTP 400)", r.status === 400, msg(r));
  const p1 = await call("PUT", `/minutes/${minutes.id}/publish`, { token: sec.token });
  const p2 = await call("PUT", `/minutes/${minutes.id}/publish`, { token: org.token });
  const code = p2.json?.data?.verification_code;
  record("TC41", "Biên bản", "Ban hành: thư ký bị từ chối, chủ tọa thành công", "Thư ký 403; chủ tọa 200 + mã BB-XXXXXXXX",
    p1.status === 403 && p2.status === 200 && /^BB-[0-9A-F]{8}$/.test(code), `thư ký HTTP ${p1.status}; chủ tọa HTTP ${p2.status}, mã=${code}`);
  r = await call("GET", `/minutes/${minutes.id}/pdf`, { token: m1.token, raw: true });
  if (r.status === 200) fs.writeFileSync(path.join(OUT, "bien-ban-kiem-thu.pdf"), r.buf);
  record("TC42", "Biên bản", "Xuất PDF biên bản tiếng Việt kèm QR", "Tệp PDF hợp lệ",
    r.status === 200 && r.buf.subarray(0, 5).toString() === "%PDF-", `HTTP ${r.status}, ${(r.buf.length / 1024).toFixed(0)} KB`);

  // ---------- Tra cứu ----------
  r = await call("GET", `/public/minutes/${code}`);
  const sigOk = (r.json?.data?.signatures || []).filter((s) => s.valid).length;
  record("TC43", "Tra cứu", "Tra cứu công khai biên bản nguyên vẹn", "Hợp lệ, không lộ nội dung",
    r.json?.data?.intact === true && sigOk === 2 && !("content" in (r.json?.data || {})), `HTTP ${r.status}, intact=${r.json?.data?.intact}, chữ ký hợp lệ=${sigOk}/2`);
  const hashBefore = r.json?.data?.contentHash;
  // Mô phỏng người có quyền vào CSDL sửa thẳng nội dung biên bản đã ban hành.
  sql(`UPDATE minutes SET content = content || E'\\nDòng thêm trái phép.' WHERE id='${minutes.id}'`);
  r = await call("GET", `/public/minutes/${code}`);
  const hashAfter = r.json?.data?.contentHash;
  const a = Buffer.from(hashBefore, "hex");
  const b = Buffer.from(hashAfter, "hex");
  let diffBits = 0;
  for (let i = 0; i < a.length; i++) for (let x = a[i] ^ b[i]; x; x >>= 1) diffBits += x & 1;
  timings.avalanche = { hashBefore, hashAfter, diffBits };
  record("TC44", "Tra cứu", "Sửa trái phép nội dung trong CSDL rồi tra cứu", "Báo nội dung đã bị thay đổi",
    r.json?.data?.intact === false, `HTTP ${r.status}, intact=${r.json?.data?.intact}, lý do="${r.json?.data?.signatures?.[0]?.reason}", ${diffBits}/256 bit băm thay đổi`);
  r = await call("GET", "/public/minutes/BB-00000000");
  record("TC45", "Tra cứu", "Tra cứu mã không tồn tại", "HTTP 404", r.status === 404, msg(r));

  // ---------- Nhật ký, thông báo ----------
  r = await call("GET", `/meetings/${meetingId}/audit-logs?limit=200`, { token: org.token });
  const acts = new Set((r.json?.data || []).map((x) => x.action));
  const failed = await call("GET", "/audit-logs?action=LOGIN_FAILED&limit=5", { token: admin.token });
  if ((failed.json?.data || []).length) acts.add("LOGIN_FAILED");
  const need = ["LOGIN_FAILED", "MEETING_CREATE", "DOCUMENT_UPLOAD", "VOTE_RESPONSE", "MINUTES_SIGN", "MINUTES_PUBLISH", "MINUTES_VERIFY"];
  const have = need.filter((x) => acts.has(x));
  record("TC46", "Nhật ký", "Nhật ký ghi lại các thao tác của kịch bản", need.join(", "), have.length === need.length, `Có ${have.length}/${need.length} loại hành động cần kiểm tra`);
  r = await call("GET", "/notifications?limit=100", { token: m1.token });
  const mine = (r.json?.data || []).filter((n) => n.meeting_id === meetingId);
  const types = [...new Set(mine.map((n) => n.type))];
  record("TC47", "Thông báo", "Thành viên nhận thông báo mời họp, biểu quyết, nhiệm vụ", "Có thông báo tương ứng",
    ["MEETING_INVITE", "VOTE_OPENED", "TASK_ASSIGNED"].every((t) => types.includes(t)),
    `HTTP ${r.status}; ${mine.length} thông báo gồm ${types.join(", ")}`);

  // ---------- AI khi chưa cấu hình khoá: chạy thêm một backend phụ ở cổng 4001 ----------
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: path.join(ROOT, "backend"),
    env: { ...process.env, PORT: "4001", ANTHROPIC_API_KEY: "" },
    stdio: "ignore"
  });
  await new Promise((ok) => setTimeout(ok, 4000));
  const api2 = "http://localhost:4001/api";
  const auth = { Authorization: `Bearer ${org.token}` };
  const status2 = await (await fetch(api2 + "/documents/ai/status", { headers: auth })).json().catch(() => ({}));
  const sum2 = await fetch(api2 + `/documents/${doc.id}/summary`, { method: "POST", headers: auth });
  const sum2j = await sum2.json().catch(() => ({}));
  child.kill();
  record("TC26", "AI", "Gọi tóm tắt khi chưa cấu hình ANTHROPIC_API_KEY", "HTTP 400, thông báo tiếng Việt",
    sum2.status === 400 && status2?.data?.configured === false, `HTTP ${sum2.status}: "${sum2j.message}"; configured=${status2?.data?.configured}`);

  // ---------- Thời gian phản hồi ----------
  const lat = [];
  for (let i = 0; i < 50; i++) lat.push((await call("GET", `/meetings/${meetingId}`, { token: org.token })).ms);
  lat.sort((x, y) => x - y);
  timings.detail = { min: lat[0], avg: lat.reduce((x, y) => x + y) / lat.length, p95: lat[Math.ceil(0.95 * lat.length) - 1], max: lat[lat.length - 1] };
}

function writeReport() {
  const rows = [...results].sort((a, b) => Number(a.id.slice(2)) - Number(b.id.slice(2)));
  const pass = rows.filter((r) => r.ok).length;
  const cell = (s) => String(s).replace(/\|/g, "/");
  let md = `# Kết quả kiểm thử API (${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })})\n\n`;
  md += `Tổng: **${pass}/${rows.length} ca đạt** (TC56 kiểm thử trên giao diện, không nằm trong kịch bản này).\n\n`;
  md += "| Mã | Nhóm | Nội dung | Kết quả mong đợi | Kết quả thực tế | Đánh giá |\n|---|---|---|---|---|---|\n";
  for (const r of rows) md += `| ${r.id} | ${r.group} | ${cell(r.name)} | ${cell(r.expected)} | ${cell(r.actual)} | ${r.ok ? "Đạt" : "Không đạt"} |\n`;
  const d = timings.detail;
  if (d) md += `\n## Thời gian phản hồi GET /api/meetings/:id (50 lần)\n\nNhỏ nhất ${d.min.toFixed(1)} ms · trung bình ${d.avg.toFixed(1)} ms · phân vị 95 ${d.p95.toFixed(1)} ms · lớn nhất ${d.max.toFixed(1)} ms\n`;
  const s = (ms) => (ms / 1000).toFixed(1);
  if (timings.discussion) md += `\n## Thời gian tác vụ AI\n\nTóm tắt ${s(timings.summary)} s · hỏi đáp ${s(timings.ask)} s · hỏi nội dung không có ${s(timings.askNone)} s · tổng hợp thảo luận ${s(timings.discussion)} s\n`;
  const av = timings.avalanche;
  if (av) md += `\n## Hiệu ứng tuyết lở (TC44)\n\nThêm một dòng vào biên bản làm ${av.diffBits}/256 bit giá trị băm thay đổi.\n\n- Trước: \`${av.hashBefore}\`\n- Sau: \`${av.hashAfter}\`\n`;
  fs.writeFileSync(path.join(OUT, "ket-qua-kiem-thu.md"), md);
  fs.writeFileSync(path.join(OUT, "ket-qua-kiem-thu.json"), JSON.stringify({ results: rows, timings }, null, 2));
  console.log(`\nTỔNG: ${pass}/${rows.length} ca đạt. Báo cáo: ${path.join(OUT, "ket-qua-kiem-thu.md")}`);
  return pass === rows.length;
}

// Xoá sạch dữ liệu kiểm thử: tệp đã tải lên, cuộc họp (các bảng con xoá dây chuyền), tài khoản tạm.
async function cleanUp() {
  const ids = cleanup.meetings.map((id) => `'${id}'`).join(",");
  if (ids) {
    const files = sql(`SELECT file_path FROM documents WHERE meeting_id IN (${ids})`).split("\n").filter(Boolean);
    for (const f of files) fs.rmSync(path.join(ROOT, "backend", f), { force: true });
    sql(`DELETE FROM meetings WHERE id IN (${ids})`);
  }
  const admin = await login(ADMIN).catch(() => null);
  for (const id of cleanup.users) await call("DELETE", `/users/${id}`, { token: admin?.token });
}

fs.mkdirSync(OUT, { recursive: true });
let ok = false;
try {
  await main();
} catch (error) {
  console.error("Dừng giữa chừng:", error.message);
} finally {
  await cleanUp().catch((error) => console.error("Dọn dữ liệu lỗi:", error.message));
  ok = writeReport();
}
process.exit(ok ? 0 : 1);
