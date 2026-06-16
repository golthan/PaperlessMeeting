import pg from "pg";
import { env } from "./env.js";

export const pool = new pg.Pool({
  connectionString: env.databaseUrl
});

export async function withTransaction(handler) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await handler(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

