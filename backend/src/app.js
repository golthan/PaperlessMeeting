import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware.js";
import { meetingAgendaRouter, agendaRouter } from "./modules/agenda/agenda.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { attendanceRouter } from "./modules/attendance/attendance.routes.js";
import { chatRouter } from "./modules/chat/chat.routes.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { departmentsRouter } from "./modules/departments/departments.routes.js";
import {
  documentsRouter,
  meetingDocumentsRouter
} from "./modules/documents/documents.routes.js";
import { meetingsRouter } from "./modules/meetings/meetings.routes.js";
import { meetingMinutesRouter, minutesRouter } from "./modules/minutes/minutes.routes.js";
import { personalNotesRouter, publicNotesRouter } from "./modules/notes/notes.routes.js";
import {
  invitationRouter,
  participantsRouter
} from "./modules/participants/participants.routes.js";
import { roomsRouter } from "./modules/rooms/rooms.routes.js";
import { meetingTasksRouter, tasksRouter } from "./modules/tasks/tasks.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";
import { meetingVotesRouter, votesRouter } from "./modules/votes/votes.routes.js";

export const app = express();

app.use(
  cors({
    origin: env.clientOrigin,
    credentials: true
  })
);
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "paperless-meeting-backend" });
});

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/departments", departmentsRouter);
app.use("/api/rooms", roomsRouter);
app.use("/api/meetings/:meetingId/invitation", invitationRouter);
app.use("/api/meetings/:meetingId/participants", participantsRouter);
app.use("/api/meetings/:meetingId/documents", meetingDocumentsRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/meetings/:meetingId/agenda", meetingAgendaRouter);
app.use("/api/agenda", agendaRouter);
app.use("/api/meetings/:meetingId/attendance", attendanceRouter);
app.use("/api/meetings/:meetingId/votes", meetingVotesRouter);
app.use("/api/votes", votesRouter);
app.use("/api/meetings/:meetingId/chat", chatRouter);
app.use("/api/meetings/:meetingId/public-notes", publicNotesRouter);
app.use("/api/meetings/:meetingId/personal-notes", personalNotesRouter);
app.use("/api/meetings/:meetingId/minutes", meetingMinutesRouter);
app.use("/api/minutes", minutesRouter);
app.use("/api/meetings/:meetingId/tasks", meetingTasksRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/meetings", meetingsRouter);
app.use("/api/dashboard", dashboardRouter);

app.use(notFoundHandler);
app.use(errorHandler);
