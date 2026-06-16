import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "../../config/db.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { uploadDocument } from "../../middlewares/upload.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { badRequest, forbidden, notFound } from "../../utils/httpError.js";
import {
  assertEnum,
  DOCUMENT_STATUSES,
  requireFields
} from "../../utils/validators.js";
import { resolveUploadPath } from "../../utils/file.js";
import {
  assertMeetingAccess,
  assertMeetingOrganizer,
  assertParticipantAccess
} from "../meetings/meetingAccess.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "../../..");

export const meetingDocumentsRouter = express.Router({ mergeParams: true });
export const documentsRouter = express.Router();

async function getDocument(documentId) {
  const { rows } = await pool.query(
    `SELECT doc.*, m.organizer_id, m.status AS meeting_status
     FROM documents doc
     JOIN meetings m ON m.id = doc.meeting_id
     WHERE doc.id = $1 AND doc.deleted_at IS NULL`,
    [documentId]
  );
  if (!rows[0]) throw notFound("Document not found");
  return rows[0];
}

async function assertDocumentAccess(user, document) {
  await assertMeetingAccess(user, document.meeting_id);
  if (user.role === "PARTICIPANT" && document.status !== "APPROVED") {
    throw forbidden("Document is not approved");
  }
}

meetingDocumentsRouter.use(authenticate);
documentsRouter.use(authenticate);

meetingDocumentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    await assertMeetingAccess(req.user, req.params.meetingId);
    const participantFilter = req.user.role === "PARTICIPANT";

    const { rows } = await pool.query(
      `SELECT doc.*, u.full_name AS uploaded_by_name
       FROM documents doc
       JOIN users u ON u.id = doc.uploaded_by
       WHERE doc.meeting_id = $1
         AND doc.deleted_at IS NULL
         AND ($2::boolean = false OR doc.status = 'APPROVED')
       ORDER BY doc.created_at DESC`,
      [req.params.meetingId, participantFilter]
    );
    res.json({ data: rows });
  })
);

meetingDocumentsRouter.post(
  "/",
  uploadDocument.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("File is required");

    let status = "PENDING";
    if (req.user.role === "ORGANIZER") {
      await assertMeetingOrganizer(req.user, req.params.meetingId);
      status = "APPROVED";
    } else if (req.user.role === "PARTICIPANT") {
      await assertParticipantAccess(req.user, req.params.meetingId);
    } else {
      throw forbidden("Only organizers or participants can upload documents");
    }

    const relativePath = path
      .relative(backendRoot, req.file.path)
      .replaceAll(path.sep, "/");

    const { rows } = await pool.query(
      `INSERT INTO documents
        (meeting_id, uploaded_by, original_name, display_name, description,
         file_path, mime_type, size, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        req.params.meetingId,
        req.user.id,
        req.file.originalname,
        req.body.displayName || req.file.originalname,
        req.body.description || null,
        relativePath,
        req.file.mimetype,
        req.file.size,
        status
      ]
    );

    res.status(201).json({ data: rows[0] });
  })
);

documentsRouter.get(
  "/:id/download",
  asyncHandler(async (req, res) => {
    const document = await getDocument(req.params.id);
    await assertDocumentAccess(req.user, document);

    res.download(resolveUploadPath(document.file_path), document.original_name);
  })
);

documentsRouter.put(
  "/:id",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    const document = await getDocument(req.params.id);
    await assertMeetingOrganizer(req.user, document.meeting_id);
    assertEnum(req.body.status, DOCUMENT_STATUSES, "document status");

    const { rows } = await pool.query(
      `UPDATE documents
       SET display_name = COALESCE($1, display_name),
           description = $2,
           status = COALESCE($3, status),
           updated_at = now()
       WHERE id = $4
       RETURNING *`,
      [
        req.body.displayName || null,
        req.body.description || null,
        req.body.status || null,
        req.params.id
      ]
    );

    res.json({ data: rows[0] });
  })
);

documentsRouter.delete(
  "/:id",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    const document = await getDocument(req.params.id);
    await assertMeetingOrganizer(req.user, document.meeting_id);

    await pool.query(
      "UPDATE documents SET deleted_at = now(), updated_at = now() WHERE id = $1",
      [req.params.id]
    );
    res.status(204).send();
  })
);

documentsRouter.put(
  "/:id/approve",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    const document = await getDocument(req.params.id);
    await assertMeetingOrganizer(req.user, document.meeting_id);
    const { rows } = await pool.query(
      `UPDATE documents SET status = 'APPROVED', updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );
    res.json({ data: rows[0] });
  })
);

documentsRouter.put(
  "/:id/reject",
  requireRole("ORGANIZER"),
  asyncHandler(async (req, res) => {
    const document = await getDocument(req.params.id);
    await assertMeetingOrganizer(req.user, document.meeting_id);
    const { rows } = await pool.query(
      `UPDATE documents SET status = 'REJECTED', updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );
    res.json({ data: rows[0] });
  })
);

