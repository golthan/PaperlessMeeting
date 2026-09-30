import multer from "multer";
import { env } from "../config/env.js";

export function notFoundHandler(req, _res, next) {
  const error = new Error(`Route ${req.method} ${req.originalUrl} not found`);
  error.status = 404;
  next(error);
}

// Postgres báo 22P02 khi giá trị sai định dạng kiểu cột, hay gặp nhất là mã UUID
// hỏng trong URL (/meetings/abc). Đó là lỗi của yêu cầu, không phải của máy chủ.
const PG_INVALID_TEXT = "22P02";

export function errorHandler(error, _req, res, _next) {
  if (error.code === PG_INVALID_TEXT && !error.status) {
    res.status(400).json({ message: "Mã định danh hoặc dữ liệu gửi lên không hợp lệ" });
    return;
  }

  // Lỗi của Multer (tệp quá lớn, sai tên trường...) là lỗi của yêu cầu tải lên.
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ message: `Tệp vượt quá dung lượng cho phép (${env.maxFileSizeMb} MB)` });
      return;
    }
    res.status(400).json({ message: "Tệp tải lên không hợp lệ", details: error.code });
    return;
  }

  const status = error.status || 500;

  if (status >= 500) {
    console.error(error);
  }

  res.status(status).json({
    message: error.message || "Internal server error",
    details: error.details
  });
}

