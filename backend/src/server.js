import { app } from "./app.js";
import { pool } from "./config/db.js";
import { env } from "./config/env.js";
import { initSocket } from "./config/socket.js";
import { startScheduler } from "./modules/notifications/reminder.scheduler.js";
import { ensureUploadDir } from "./utils/file.js";
import http from "http";

ensureUploadDir();

const server = http.createServer(app);
initSocket(server);
const stopScheduler = startScheduler();

server.listen(env.port, () => {
  console.log(`Paperless Meeting API is running at http://localhost:${env.port}`);
});

async function shutdown() {
  console.log("Shutting down server...");
  stopScheduler();
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
