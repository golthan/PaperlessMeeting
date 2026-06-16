import { forbidden } from "../utils/httpError.js";

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw forbidden("Insufficient role");
    }
    next();
  };
}

