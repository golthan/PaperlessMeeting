import multer from "multer";
import path from "path";
import { v4 as uuid } from "uuid";
import { env } from "../config/env.js";
import { ensureUploadDir, isAllowedDocument, uploadRoot } from "../utils/file.js";

ensureUploadDir();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    cb(null, `${uuid()}${path.extname(file.originalname).toLowerCase()}`);
  }
});

export const uploadDocument = multer({
  storage,
  limits: {
    fileSize: env.maxFileSizeMb * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedDocument(file.originalname)) {
      cb(new Error("Only PDF, DOCX, PPTX and XLSX files are allowed"));
      return;
    }
    cb(null, true);
  }
});

