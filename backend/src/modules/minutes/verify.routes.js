import express from "express";
import { pool } from "../../config/db.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { notFound } from "../../utils/httpError.js";
import { AUDIT_ACTIONS, writeAuditLog } from "../audit/audit.service.js";
import { verifyMinutesIntegrity } from "./minutes.signing.js";

/**
 * Trang tra cứu công khai — không cần đăng nhập.
 *
 * Người nhận một bản in của biên bản quét mã QR ở chân trang là ra đây. Hệ
 * thống băm lại nội dung đang lưu, kiểm tra từng chữ ký và trả lời: biên bản
 * này có thật, do ai ký, ký lúc nào, nội dung còn nguyên vẹn hay đã bị sửa.
 *
 * Chỉ trả siêu dữ liệu, không trả nội dung biên bản, để người ngoài không đọc
 * được nội dung cuộc họp chỉ nhờ biết mã tra cứu.
 */
export const publicVerifyRouter = express.Router();

publicVerifyRouter.get(
  "/minutes/:code",
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT mn.*, m.title AS meeting_title, m.start_time, m.meeting_type,
              u.full_name AS organizer_name
       FROM minutes mn
       JOIN meetings m ON m.id = mn.meeting_id
       JOIN users u ON u.id = m.organizer_id
       WHERE mn.verification_code = $1 AND mn.status = 'PUBLISHED'`,
      [String(req.params.code).trim().toUpperCase()]
    );

    const minutes = rows[0];
    if (!minutes) {
      throw notFound("Không tìm thấy biên bản với mã tra cứu này");
    }

    const integrity = await verifyMinutesIntegrity(minutes);

    await writeAuditLog(req, {
      action: AUDIT_ACTIONS.MINUTES_VERIFY,
      entityType: "MINUTES",
      entityId: minutes.id,
      meetingId: minutes.meeting_id,
      actorName: "Khách tra cứu",
      description: `Tra cứu biên bản ${minutes.verification_code} - kết quả: ${
        integrity.intact ? "toàn vẹn" : "đã bị thay đổi"
      }`
    });

    res.json({
      data: {
        verificationCode: minutes.verification_code,
        meetingTitle: minutes.meeting_title,
        meetingStartTime: minutes.start_time,
        organizerName: minutes.organizer_name,
        publishedAt: minutes.published_at,
        contentHash: integrity.currentHash,
        intact: integrity.intact,
        signatures: integrity.signatures.map((item) => ({
          signerName: item.signerName,
          signerTitle: item.signerTitle,
          signedAt: item.signedAt,
          algorithm: item.algorithm,
          valid: item.valid,
          reason: item.reason
        }))
      }
    });
  })
);
