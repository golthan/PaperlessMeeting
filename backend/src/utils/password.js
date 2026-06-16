import bcrypt from "bcryptjs";

export function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

