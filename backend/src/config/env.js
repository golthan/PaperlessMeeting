import dotenv from "dotenv";

dotenv.config();

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
  livekitApiKey: process.env.LIVEKIT_API_KEY || "paperless-key",
  livekitApiSecret:
    process.env.LIVEKIT_API_SECRET || "paperless_livekit_dev_secret_0123456789",
  // De trong: client tu suy ra ws://<hostname dang mo trang>:7880
  livekitWsUrl: process.env.LIVEKIT_WS_URL || "",
  // Tro ly AI cho tai lieu. Khong dat khoa thi tinh nang AI bao loi ro rang,
  // phan con lai cua he thong van chay binh thuong.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  aiModel: process.env.AI_MODEL || "claude-opus-5"
};
