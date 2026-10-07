import cors from "cors";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import express from "express";
import pg from "pg";

const port = Number(process.env.PORT ?? 3001);
const app = express();
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

app.use(cors());
app.use(express.json());

const recoveryTokens = new Map<string, { userId: string; expiresAt: number }>();

function derivePasswordHash(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, 64, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

function normalizedAnswer(answer: string): Buffer {
  return Buffer.from(answer.normalize("NFKC").trim().toLowerCase());
}

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "degraded", database: "unavailable" });
  }
});

app.post("/api/auth/recovery/question", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ message: "Please enter a valid email address." });
    return;
  }

  try {
    const result = await pool.query(
      "SELECT question_choice FROM users WHERE lower(email) = lower($1)",
      [email],
    );
    if (result.rowCount === 0) {
      res.status(404).json({ message: "No account was found for that email address." });
      return;
    }
    res.json({ question: result.rows[0].question_choice });
  } catch {
    res.status(500).json({ message: "Password recovery is temporarily unavailable." });
  }
});

app.post("/api/auth/recovery/verify", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const answer = typeof req.body?.answer === "string" ? req.body.answer : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !answer.trim()) {
    res.status(400).json({ message: "Enter your email and security answer." });
    return;
  }

  try {
    const result = await pool.query(
      "SELECT user_id, answer FROM users WHERE lower(email) = lower($1)",
      [email],
    );
    const user = result.rows[0] as { user_id: string; answer: string } | undefined;
    if (!user) {
      res.status(404).json({ message: "No account was found for that email address." });
      return;
    }

    const expectedAnswer = normalizedAnswer(user.answer);
    const suppliedAnswer = normalizedAnswer(answer);
    if (expectedAnswer.length !== suppliedAnswer.length || !timingSafeEqual(expectedAnswer, suppliedAnswer)) {
      res.status(401).json({ message: "That answer does not match our records." });
      return;
    }

    for (const [token, entry] of recoveryTokens) {
      if (entry.expiresAt <= Date.now()) recoveryTokens.delete(token);
    }
    const resetToken = randomBytes(32).toString("hex");
    recoveryTokens.set(resetToken, { userId: user.user_id, expiresAt: Date.now() + 15 * 60 * 1000 });
    res.json({ resetToken });
  } catch {
    res.status(500).json({ message: "Password recovery is temporarily unavailable." });
  }
});

app.post("/api/auth/recovery/reset", async (req, res) => {
  const resetToken = typeof req.body?.resetToken === "string" ? req.body.resetToken : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!resetToken || password.length < 8) {
    res.status(400).json({ message: "Use a reset link and a password with at least 8 characters." });
    return;
  }

  const token = recoveryTokens.get(resetToken);
  if (!token || token.expiresAt <= Date.now()) {
    recoveryTokens.delete(resetToken);
    res.status(400).json({ message: "Your recovery session has expired. Please start again." });
    return;
  }

  recoveryTokens.delete(resetToken);
  try {
    const salt = randomBytes(16).toString("hex");
    const hash = await derivePasswordHash(password, salt);
    await pool.query(
      "UPDATE users SET password_hash = $1 WHERE user_id = $2",
      [`scrypt$${salt}$${hash.toString("hex")}`, token.userId],
    );
    res.json({ message: "Your password has been updated." });
  } catch {
    res.status(500).json({ message: "Password recovery is temporarily unavailable." });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`API listening on ${port}`);
});
