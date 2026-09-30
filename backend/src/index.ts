import cors from "cors";
import express from "express";
import pg from "pg";

const port = Number(process.env.PORT ?? 3001);
const app = express();
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

app.use(cors());
app.use(express.json());

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "degraded", database: "unavailable" });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`API listening on ${port}`);
});
