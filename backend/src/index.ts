import pg from "pg";
import { createApp } from "./app.js";
import { createStripePayments } from "./payments.js";
import { createPgCartStore, createPgDeliveryStore, createPgOrderStore, createPgProductStore, createPgSalesStore, createPgSettingsStore, createPgStore, ensureDeliveryTrackingSchema, ensureGlobalSettingsSchema, ensureInventoryManagementSchema } from "./store.js";

const port = Number(process.env.PORT ?? 3001);
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

await ensureGlobalSettingsSchema(pool);
await ensureInventoryManagementSchema(pool);
await ensureDeliveryTrackingSchema(pool);
const settingsStore = createPgSettingsStore(pool);
const app = createApp({
  store: createPgStore(pool),
  cartStore: createPgCartStore(pool),
  orderStore: createPgOrderStore(pool, settingsStore),
  settingsStore,
  productStore: createPgProductStore(pool),
  salesStore: createPgSalesStore(pool),
  deliveryStore: createPgDeliveryStore(pool),
  payments: createStripePayments(process.env.STRIPE_SECRET_KEY),
  appUrl: process.env.APP_URL ?? "http://localhost:5173",
  secureCookies: process.env.NODE_ENV === "production",
  checkDatabase: async () => {
    await pool.query("SELECT 1");
  },
});

app.listen(port, "0.0.0.0", () => {
  console.log(`API listening on ${port}`);
});
