-- =====================================================================
-- Bộ truy vấn để "show" dữ liệu đang lưu trong PostgreSQL khi demo.
--
-- Chạy toàn bộ:
--   docker exec -i paperless-meeting-postgres psql -U paperless -d paperless_meeting < scripts/db-demo-queries.sql
--
-- Hoặc mở psql rồi chạy từng câu:
--   docker exec -it paperless-meeting-postgres psql -U paperless -d paperless_meeting
-- =====================================================================

\echo '\n===== 1. NGƯỜI DÙNG VÀ PHÂN QUYỀN ====='
SELECT u.full_name AS ho_ten,
       u.email,
       u.role AS vai_tro,
       u.status AS trang_thai,
       d.name AS phong_ban
FROM users u
LEFT JOIN departments d ON d.id = u.department_id
WHERE u.deleted_at IS NULL
ORDER BY u.role, u.full_name;

\echo '\n===== 2. DANH SÁCH CUỘC HỌP (hình thức tập trung / trực tuyến / kết hợp) ====='
SELECT m.title AS cuoc_hop,
       m.meeting_type AS hinh_thuc,
       m.status AS trang_thai,
       COALESCE(r.name, '(khong dung phong vat ly)') AS phong_hop,
       COALESCE(m.online_room_name, '(chua bat phong truc tuyen)') AS phong_truc_tuyen,
       to_char(m.start_time AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI') AS bat_dau,
       to_char(m.online_enabled_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') AS bat_video_luc,
       COUNT(mp.id) AS so_nguoi_du
FROM meetings m
LEFT JOIN rooms r ON r.id = m.room_id
LEFT JOIN meeting_participants mp ON mp.meeting_id = m.id
WHERE m.deleted_at IS NULL
GROUP BY m.id, r.name
ORDER BY m.start_time;

\echo '\n===== 3. THÀNH PHẦN THAM DỰ + ĐIỂM DANH ====='
SELECT m.title AS cuoc_hop,
       u.full_name AS ho_ten,
       mp.role_in_meeting AS vai_tro,
       mp.invitation_status AS loi_moi,
       COALESCE(mp.attendance_status, 'ABSENT') AS diem_danh,
       COALESCE(mp.attendance_method, '-') AS cach_diem_danh,
       to_char(mp.checked_in_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI:SS') AS gio_diem_danh,
       mp.is_online AS dang_trong_phong
FROM meeting_participants mp
JOIN users u ON u.id = mp.user_id
JOIN meetings m ON m.id = mp.meeting_id
WHERE m.deleted_at IS NULL
ORDER BY m.start_time, u.full_name;

\echo '\n===== 4. THỐNG KÊ ĐIỂM DANH THEO CUỘC HỌP ====='
SELECT m.title AS cuoc_hop,
       COUNT(*) AS duoc_moi,
       COUNT(*) FILTER (WHERE mp.attendance_status = 'PRESENT') AS co_mat,
       COUNT(*) FILTER (WHERE mp.attendance_status = 'LATE') AS di_muon,
       COUNT(*) FILTER (WHERE mp.attendance_status IS NULL OR mp.attendance_status = 'ABSENT') AS vang,
       ROUND(
         100.0 * COUNT(*) FILTER (WHERE mp.attendance_status IN ('PRESENT', 'LATE')) / NULLIF(COUNT(*), 0)
       ) AS ty_le_phan_tram
FROM meetings m
JOIN meeting_participants mp ON mp.meeting_id = m.id
WHERE m.deleted_at IS NULL
GROUP BY m.id
ORDER BY m.start_time;

\echo '\n===== 5. CHƯƠNG TRÌNH NGHỊ SỰ ====='
SELECT m.title AS cuoc_hop,
       a.sort_order AS thu_tu,
       a.title AS noi_dung,
       COALESCE(u.full_name, '(chua chon)') AS nguoi_trinh_bay,
       a.duration_minutes AS so_phut,
       a.status AS trang_thai
FROM agenda_items a
JOIN meetings m ON m.id = a.meeting_id
LEFT JOIN users u ON u.id = a.presenter_id
ORDER BY m.start_time, a.sort_order;

\echo '\n===== 6. TÀI LIỆU SỐ (thay cho tài liệu giấy) ====='
SELECT m.title AS cuoc_hop,
       d.display_name AS ten_tai_lieu,
       d.original_name AS file_goc,
       d.status AS trang_thai_duyet,
       u.full_name AS nguoi_gui,
       pg_size_pretty(d.size) AS dung_luong,
       d.is_presenting AS dang_trinh_chieu
FROM documents d
JOIN meetings m ON m.id = d.meeting_id
JOIN users u ON u.id = d.uploaded_by
WHERE d.deleted_at IS NULL
ORDER BY d.created_at DESC;

\echo '\n===== 7. BIỂU QUYẾT VÀ KẾT QUẢ ====='
SELECT m.title AS cuoc_hop,
       v.title AS noi_dung_bieu_quyet,
       v.status AS trang_thai,
       v.type AS loai_phieu,
       v.is_anonymous AS bieu_quyet_kin,
       v.options AS cac_phuong_an,
       COUNT(vr.id) AS so_phieu_da_bo
FROM votes v
JOIN meetings m ON m.id = v.meeting_id
LEFT JOIN vote_responses vr ON vr.vote_id = v.id
GROUP BY v.id, m.title, m.start_time
ORDER BY m.start_time, v.created_at;

\echo '\n===== 8. CHI TIẾT PHIẾU BẦU (chỉ với biểu quyết công khai) ====='
SELECT v.title AS noi_dung_bieu_quyet,
       u.full_name AS nguoi_bo_phieu,
       vr.answer AS lua_chon,
       to_char(vr.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI:SS') AS thoi_diem
FROM vote_responses vr
JOIN votes v ON v.id = vr.vote_id
JOIN users u ON u.id = vr.user_id
WHERE v.is_anonymous = false
ORDER BY v.created_at, vr.created_at;

\echo '\n===== 9. BIÊN BẢN VÀ NHIỆM VỤ SAU HỌP ====='
SELECT m.title AS cuoc_hop,
       mi.status AS trang_thai_bien_ban,
       LEFT(mi.content, 60) AS trich_noi_dung
FROM minutes mi
JOIN meetings m ON m.id = mi.meeting_id
ORDER BY m.start_time;

SELECT m.title AS cuoc_hop,
       t.title AS nhiem_vu,
       assignee.full_name AS nguoi_nhan,
       t.deadline AS han_chot,
       t.priority AS uu_tien,
       t.status AS trang_thai
FROM meeting_tasks t
JOIN meetings m ON m.id = t.meeting_id
JOIN users assignee ON assignee.id = t.assigned_to
WHERE t.deleted_at IS NULL
ORDER BY t.deadline;

\echo '\n===== 10. THÔNG BÁO ĐÃ GỬI ====='
SELECT u.full_name AS nguoi_nhan,
       n.type AS loai,
       n.title AS tieu_de,
       n.is_read AS da_doc,
       to_char(n.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') AS luc
FROM notifications n
JOIN users u ON u.id = n.user_id
ORDER BY n.created_at DESC
LIMIT 20;

\echo '\n===== 11. CHAT VÀ LỊCH SỬ RA VÀO PHÒNG HỌP ====='
SELECT m.title AS cuoc_hop,
       u.full_name AS nguoi_gui,
       c.content AS noi_dung,
       to_char(c.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') AS luc
FROM chat_messages c
JOIN meetings m ON m.id = c.meeting_id
JOIN users u ON u.id = c.sender_id
ORDER BY c.created_at DESC
LIMIT 20;

SELECT m.title AS cuoc_hop,
       u.full_name AS nguoi_du,
       to_char(s.joined_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI:SS') AS vao_luc,
       to_char(s.left_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI:SS') AS roi_luc,
       s.duration_seconds AS so_giay_o_trong_phong
FROM meeting_sessions s
JOIN meetings m ON m.id = s.meeting_id
JOIN users u ON u.id = s.user_id
ORDER BY s.joined_at DESC
LIMIT 20;

\echo '\n===== 12. TỔNG SỐ BẢN GHI TỪNG BẢNG ====='
SELECT 'departments' AS bang, COUNT(*) FROM departments
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'rooms', COUNT(*) FROM rooms
UNION ALL SELECT 'meetings', COUNT(*) FROM meetings
UNION ALL SELECT 'meeting_participants', COUNT(*) FROM meeting_participants
UNION ALL SELECT 'agenda_items', COUNT(*) FROM agenda_items
UNION ALL SELECT 'documents', COUNT(*) FROM documents
UNION ALL SELECT 'attendance', COUNT(*) FROM attendance
UNION ALL SELECT 'votes', COUNT(*) FROM votes
UNION ALL SELECT 'vote_responses', COUNT(*) FROM vote_responses
UNION ALL SELECT 'minutes', COUNT(*) FROM minutes
UNION ALL SELECT 'meeting_tasks', COUNT(*) FROM meeting_tasks
UNION ALL SELECT 'chat_messages', COUNT(*) FROM chat_messages
UNION ALL SELECT 'meeting_sessions', COUNT(*) FROM meeting_sessions
UNION ALL SELECT 'notifications', COUNT(*) FROM notifications
ORDER BY 1;
