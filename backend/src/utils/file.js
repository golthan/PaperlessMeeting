import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "../config/env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "../../");

export const uploadRoot = path.resolve(backendRoot, env.uploadDir);

export const allowedDocumentExtensions = [".pdf", ".docx", ".pptx", ".xlsx"];

export function ensureUploadDir() {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

export function isAllowedDocument(filename) {
  return allowedDocumentExtensions.includes(path.extname(filename).toLowerCase());
}

export function resolveUploadPath(relativePath) {
  const target = path.resolve(backendRoot, relativePath);
  if (!target.startsWith(uploadRoot)) {
    throw new Error("Invalid upload path");
  }
  return target;
}

