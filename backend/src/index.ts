import pg from "pg";
import { createApp } from "./app.js";
import { logPasswordReset } from "./auth.js";
import { createPgStore } from "./store.js";

const port = Number(process.env.PORT ?? 3001);
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const app = createApp({
  store: createPgStore(pool),
  appUrl: process.env.APP_URL ?? "http://localhost:5173",
  secureCookies: process.env.NODE_ENV === "production",
  sendPasswordReset: logPasswordReset,
  checkDatabase: async () => {
    await pool.query("SELECT 1");
  },
});

app.listen(port, "0.0.0.0", () => {
  console.log(`API listening on ${port}`);
});
