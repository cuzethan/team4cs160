import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { EmailTakenError, type AuthStore, type CustomerRecord, type User } from "../src/store.js";

function createMemoryStore() {
  const users = new Map<string, User>();
  const sessions = new Map<string, { userId: string; expiresAt: Date }>();
  const resets = new Map<string, { userId: string; expiresAt: Date; used: boolean }>();

  const store: AuthStore = {
    async findUserByEmail(email) {
      return [...users.values()].find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
    },
    async listCustomers() {
      return [...users.values()]
        .filter((user) => user.role === "customer")
        .map((user): CustomerRecord => ({
          id: user.userId,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          accountStatus: user.accountStatus,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        }));
    },
    async createUser(user) {
      if (await store.findUserByEmail(user.email)) throw new EmailTakenError();
      const created: User = { ...user, userId: randomUUID(), accountStatus: "active" };
      users.set(created.userId, created);
      return created;
    },
    async updatePassword(userId, passwordHash) {
      users.get(userId)!.passwordHash = passwordHash;
    },
    async createSession(userId, tokenHash, expiresAt) {
      sessions.set(tokenHash, { userId, expiresAt });
    },
    async findSessionUser(tokenHash) {
      const session = sessions.get(tokenHash);
      if (!session || session.expiresAt <= new Date()) return null;
      return users.get(session.userId) ?? null;
    },
    async deleteSession(tokenHash) {
      sessions.delete(tokenHash);
    },
    async deleteUserSessions(userId) {
      for (const [hash, session] of sessions) if (session.userId === userId) sessions.delete(hash);
    },
    async createResetToken(userId, tokenHash, expiresAt) {
      resets.set(tokenHash, { userId, expiresAt, used: false });
    },
    async consumeResetToken(tokenHash) {
      const reset = resets.get(tokenHash);
      if (!reset || reset.used || reset.expiresAt <= new Date()) return null;
      reset.used = true;
      return reset.userId;
    },
  };

  return { store, users };
}

const customer = {
  firstName: "Lee",
  lastName: "Nguyen",
  phone: "(408) 555-0100",
  email: "Lee@ofs.com",
  password: "carrots123",
  securityQuestion: "What was the name of your last pet?",
  securityAnswer: "Fluffy",
};

describe("auth API", () => {
  let memory: ReturnType<typeof createMemoryStore>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    memory = createMemoryStore();
    app = createApp({
      store: memory.store,
      appUrl: "http://localhost:5173",
      secureCookies: false,
      checkDatabase: async () => {},
    });
  });

  it("registers a customer, logs them in, and hides the password hash", async () => {
    const agent = request.agent(app);
    const res = await agent.post("/api/auth/register").send(customer);

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ firstName: "Lee", email: "Lee@ofs.com", role: "customer" });
    expect(JSON.stringify(res.body)).not.toMatch(/Hash|Fluffy/);
    expect(res.headers["set-cookie"][0]).toMatch(/ofs_session=.*HttpOnly/);

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe("Lee@ofs.com");
  });

  it("rejects missing fields, bad emails, short passwords, and duplicate emails", async () => {
    const missing = await request(app).post("/api/auth/register").send({ ...customer, phone: " " });
    expect(missing.status).toBe(400);

    const badEmail = await request(app).post("/api/auth/register").send({ ...customer, email: "lee" });
    expect(badEmail.status).toBe(400);

    const short = await request(app).post("/api/auth/register").send({ ...customer, password: "short" });
    expect(short.status).toBe(400);

    const badQuestion = await request(app)
      .post("/api/auth/register")
      .send({ ...customer, securityQuestion: "What is your favorite color?" });
    expect(badQuestion.status).toBe(400);

    await request(app).post("/api/auth/register").send(customer);
    const duplicate = await request(app)
      .post("/api/auth/register")
      .send({ ...customer, email: "lee@OFS.com" });
    expect(duplicate.status).toBe(409);
  });

  it("logs in with the right password (any email case) and rejects the wrong one", async () => {
    await request(app).post("/api/auth/register").send(customer);

    const ok = await request(app)
      .post("/api/auth/login")
      .send({ email: "lee@ofs.com", password: customer.password, role: "customer" });
    expect(ok.status).toBe(200);
    expect(ok.body.user.role).toBe("customer");

    const wrong = await request(app)
      .post("/api/auth/login")
      .send({ email: customer.email, password: "wrongpass1", role: "customer" });
    expect(wrong.status).toBe(401);

    const unknown = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@ofs.com", password: "whatever1", role: "customer" });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error).toBe(wrong.body.error);
  });

  it("keeps customers and managers on their own login pages", async () => {
    await request(app).post("/api/auth/register").send(customer);
    await memory.store.createUser({
      firstName: "Max",
      lastName: "Boss",
      phone: "000",
      email: "manager@ofs.com",
      passwordHash: await bcrypt.hash("manager123", 4),
      role: "admin",
      questionChoice: "What is your dream car?",
      answerHash: await bcrypt.hash("tesla", 4),
    });

    const customerAtManager = await request(app)
      .post("/api/auth/login")
      .send({ email: customer.email, password: customer.password, role: "manager" });
    expect(customerAtManager.status).toBe(403);

    const managerAtCustomer = await request(app)
      .post("/api/auth/login")
      .send({ email: "manager@ofs.com", password: "manager123", role: "customer" });
    expect(managerAtCustomer.status).toBe(403);

    const manager = await request(app)
      .post("/api/auth/login")
      .send({ email: "manager@ofs.com", password: "manager123", role: "manager" });
    expect(manager.status).toBe(200);
    expect(manager.body.user.role).toBe("manager");
  });

  it("lists customer account details for managers only", async () => {
    await request(app).post("/api/auth/register").send(customer);
    const customerAgent = request.agent(app);
    await customerAgent.post("/api/auth/login").send({
      email: customer.email,
      password: customer.password,
      role: "customer",
    });

    const forbidden = await customerAgent.get("/api/auth/customers");
    expect(forbidden.status).toBe(403);

    await memory.store.createUser({
      firstName: "Max",
      lastName: "Boss",
      phone: "000",
      email: "manager@ofs.com",
      passwordHash: await bcrypt.hash("manager123", 4),
      role: "admin",
      questionChoice: "What is your dream car?",
      answerHash: await bcrypt.hash("tesla", 4),
    });
    const managerAgent = request.agent(app);
    await managerAgent.post("/api/auth/login").send({
      email: "manager@ofs.com",
      password: "manager123",
      role: "manager",
    });

    const response = await managerAgent.get("/api/auth/customers");
    expect(response.status).toBe(200);
    expect(response.body.customers).toHaveLength(1);
    expect(response.body.customers[0]).toMatchObject({
      firstName: "Lee",
      lastName: "Nguyen",
      email: "Lee@ofs.com",
      phone: "(408) 555-0100",
      accountStatus: "active",
    });
    expect(response.body.customers[0]).toHaveProperty("createdAt");
    expect(JSON.stringify(response.body)).not.toMatch(/password|question|answer/i);
  });

  it("blocks disabled accounts", async () => {
    const res = await request(app).post("/api/auth/register").send(customer);
    memory.users.get(res.body.user.id)!.accountStatus = "disabled";

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: customer.email, password: customer.password, role: "customer" });
    expect(login.status).toBe(403);
  });

  it("logs out and ends the session", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(customer);

    expect((await agent.post("/api/auth/logout")).status).toBe(204);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("recovers a password with the security question and logs out old sessions", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(customer);

    const question = await request(app).post("/api/auth/recovery/question").send({ email: "lee@ofs.com" });
    expect(question.status).toBe(200);
    expect(question.body.question).toBe(customer.securityQuestion);

    const wrong = await request(app)
      .post("/api/auth/recovery/verify")
      .send({ email: customer.email, answer: "Rex" });
    expect(wrong.status).toBe(401);

    const verify = await request(app)
      .post("/api/auth/recovery/verify")
      .send({ email: customer.email, answer: "  fluffy " });
    expect(verify.status).toBe(200);
    const { resetToken } = verify.body;

    const reset = await request(app)
      .post("/api/auth/recovery/reset")
      .send({ resetToken, password: "newcarrots1" });
    expect(reset.status).toBe(200);

    expect((await agent.get("/api/auth/me")).status).toBe(401);

    const reused = await request(app)
      .post("/api/auth/recovery/reset")
      .send({ resetToken, password: "another123" });
    expect(reused.status).toBe(400);

    const oldPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: customer.email, password: customer.password });
    expect(oldPassword.status).toBe(401);

    const newPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: customer.email, password: "newcarrots1" });
    expect(newPassword.status).toBe(200);
  });

  it("tells the user when no account matches the recovery email", async () => {
    const res = await request(app).post("/api/auth/recovery/question").send({ email: "x@ofs.com" });
    expect(res.status).toBe(404);
  });
});
