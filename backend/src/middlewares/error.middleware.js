export function notFoundHandler(req, _res, next) {
  const error = new Error(`Route ${req.method} ${req.originalUrl} not found`);
  error.status = 404;
  next(error);
}

export function errorHandler(error, _req, res, _next) {
  const status = error.status || 500;

  if (status >= 500) {
    console.error(error);
  }

  res.status(status).json({
    message: error.message || "Internal server error",
    details: error.details
  });
}

