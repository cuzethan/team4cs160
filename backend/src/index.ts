import pg from "pg";
import { createApp } from "./app.js";
import { createPgCartStore, createPgOrderStore, createPgProductStore, createPgStore } from "./store.js";

const port = Number(process.env.PORT ?? 3001);
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const app = createApp({
  store: createPgStore(pool),
  cartStore: createPgCartStore(pool),
  orderStore: createPgOrderStore(pool),
  productStore: createPgProductStore(pool),
  appUrl: process.env.APP_URL ?? "http://localhost:5173",
  secureCookies: process.env.NODE_ENV === "production",
  checkDatabase: async () => {
    await pool.query("SELECT 1");
  },
});

app.listen(port, "0.0.0.0", () => {
  console.log(`API listening on ${port}`);
});
