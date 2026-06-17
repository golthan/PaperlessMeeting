import dotenv from "dotenv";

dotenv.config();

const jitsiDomain = process.env.JITSI_DOMAIN || "meet.jit.si";
const jitsiScheme = process.env.JITSI_SCHEME || "https";
const jitsiRoomUrlBase =
  process.env.JITSI_ROOM_URL_BASE || `${jitsiScheme}://${jitsiDomain}`;

export const env = {
  port: Number(process.env.PORT || 4000),
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgres://paperless:paperless@localhost:5432/paperless_meeting",
  jwtSecret: process.env.JWT_SECRET || "dev_secret_change_me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  uploadDir: process.env.UPLOAD_DIR || "uploads",
  maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB || 20),
  jitsiDomain,
  jitsiExternalApiUrl:
    process.env.JITSI_EXTERNAL_API_URL || `${jitsiRoomUrlBase}/external_api.js`,
  jitsiRoomUrlBase
};
