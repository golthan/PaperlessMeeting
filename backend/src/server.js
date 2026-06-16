import { app } from "./app.js";
import { pool } from "./config/db.js";
import { env } from "./config/env.js";
import { ensureUploadDir } from "./utils/file.js";

ensureUploadDir();

const server = app.listen(env.port, () => {
  console.log(`Paperless Meeting API is running at http://localhost:${env.port}`);
});

async function shutdown() {
  console.log("Shutting down server...");
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

