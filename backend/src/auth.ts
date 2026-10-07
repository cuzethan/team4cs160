import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import express, { type Request, type Response } from "express";
import { EmailTakenError, type AuthStore, type User } from "./store.js";

export const SESSION_COOKIE = "ofs_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RECOVERY_TTL_MS = 15 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Must match the CHECK on users.question_choice in db/init/001_init.sql.
export const SECURITY_QUESTIONS = [
  "What was the name of your last pet?",
  "Who was your favorite teacher?",
  "What is your dream car?",
];

export type AuthOptions = {
  store: AuthStore;
  appUrl: string;
  secureCookies: boolean;
};

// What the frontend sees. "admin" in the database is the manager login.
export type PublicUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: "customer" | "manager";
};

function toPublicUser(user: User): PublicUser {
  return {
    id: user.userId,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    role: user.role === "admin" ? "manager" : "customer",
  };
}

function newToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// "Fluffy " and "fluffy" count as the same answer.
export function normalizeAnswer(answer: string) {
  return answer.normalize("NFKC").trim().toLowerCase();
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function passwordProblem(password: unknown) {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

// Wraps async handlers so a thrown error becomes a 500 instead of an unhandled rejection.
function handle(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response) => {
    fn(req, res).catch((error) => {
      console.error(error);
      res.status(500).json({ error: "Something went wrong. Please try again." });
    });
  };
}

export function createAuthRouter({ store, secureCookies }: AuthOptions) {
  const router = express.Router();

  async function startSession(res: Response, user: User) {
    const { token, tokenHash } = newToken();
    await store.createSession(user.userId, tokenHash, new Date(Date.now() + SESSION_TTL_MS));
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookies,
      maxAge: SESSION_TTL_MS,
      path: "/",
    });
  }

  router.post("/register", handle(async (req, res) => {
    const firstName = text(req.body?.firstName);
    const lastName = text(req.body?.lastName);
    const phone = text(req.body?.phone);
    const email = text(req.body?.email);
    const password = req.body?.password;
    const securityQuestion = text(req.body?.securityQuestion);
    const securityAnswer = text(req.body?.securityAnswer);

    if (!firstName || !lastName || !phone || !email || !securityAnswer) {
      return res.status(400).json({ error: "Please fill in every field." });
    }
    if (!SECURITY_QUESTIONS.includes(securityQuestion)) {
      return res.status(400).json({ error: "Please choose a security question." });
    }
    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ error: problem });

    let user: User;
    try {
      user = await store.createUser({
        firstName,
        lastName,
        phone,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role: "customer",
        questionChoice: securityQuestion,
        answerHash: await bcrypt.hash(normalizeAnswer(securityAnswer), 10),
      });
    } catch (error) {
      if (error instanceof EmailTakenError) {
        return res.status(409).json({ error: error.message });
      }
      throw error;
    }

    await startSession(res, user);
    res.status(201).json({ user: toPublicUser(user) });
  }));

  router.post("/login", handle(async (req, res) => {
    const email = text(req.body?.email);
    const password = req.body?.password;
    const portal = req.body?.role === "manager" ? "manager" : "customer";

    if (!email || typeof password !== "string" || !password) {
      return res.status(400).json({ error: "Please enter your email and password." });
    }

    const user = await store.findUserByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }
    if (user.accountStatus !== "active") {
      return res.status(403).json({ error: "This account has been disabled." });
    }

    const publicUser = toPublicUser(user);
    if (publicUser.role !== portal) {
      return res.status(403).json({
        error: portal === "manager"
          ? "This account is not a manager account. Use the customer login."
          : "Manager accounts must use the manager login.",
      });
    }

    await startSession(res, user);
    res.json({ user: publicUser });
  }));

  router.post("/logout", handle(async (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token === "string") await store.deleteSession(hashToken(token));
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.status(204).end();
  }));

  router.get("/me", handle(async (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE];
    const user = typeof token === "string" ? await store.findSessionUser(hashToken(token)) : null;
    if (!user || user.accountStatus !== "active") {
      return res.status(401).json({ error: "Not logged in." });
    }
    res.json({ user: toPublicUser(user) });
  }));

  // Password recovery, step 1: look up the account's security question.
  router.post("/recovery/question", handle(async (req, res) => {
    const email = text(req.body?.email);
    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }

    const user = await store.findUserByEmail(email);
    if (!user || user.accountStatus !== "active") {
      return res.status(404).json({ error: "No account was found for that email address." });
    }
    res.json({ question: user.questionChoice });
  }));

  // Step 2: check the answer and hand out a short-lived, single-use reset token.
  router.post("/recovery/verify", handle(async (req, res) => {
    const email = text(req.body?.email);
    const answer = text(req.body?.answer);
    if (!EMAIL_PATTERN.test(email) || !answer) {
      return res.status(400).json({ error: "Enter your email and security answer." });
    }

    const user = await store.findUserByEmail(email);
    if (!user || user.accountStatus !== "active") {
      return res.status(404).json({ error: "No account was found for that email address." });
    }
    if (!(await bcrypt.compare(normalizeAnswer(answer), user.answerHash))) {
      return res.status(401).json({ error: "That answer does not match our records." });
    }

    const { token, tokenHash } = newToken();
    await store.createResetToken(user.userId, tokenHash, new Date(Date.now() + RECOVERY_TTL_MS));
    res.json({ resetToken: token });
  }));

  // Step 3: set the new password.
  router.post("/recovery/reset", handle(async (req, res) => {
    const resetToken = text(req.body?.resetToken);
    const password = req.body?.password;

    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ error: problem });

    const userId = resetToken ? await store.consumeResetToken(hashToken(resetToken)) : null;
    if (!userId) {
      return res.status(400).json({ error: "Your recovery session has expired. Please start again." });
    }

    await store.updatePassword(userId, await bcrypt.hash(password, 10));
    // Log out everywhere, in case someone else had the old password.
    await store.deleteUserSessions(userId);
    res.json({ message: "Your password has been updated." });
  }));

  return router;
}
