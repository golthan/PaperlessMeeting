import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

