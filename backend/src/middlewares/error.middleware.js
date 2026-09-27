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

  const status = error.status || 500;

  if (status >= 500) {
    console.error(error);
  }

  res.status(status).json({
    message: error.message || "Internal server error",
    details: error.details
  });
}

