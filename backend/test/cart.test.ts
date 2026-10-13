import bcrypt from "bcryptjs";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createMemoryCartStore, createMemoryOrderStore, createMemoryStore } from "./memoryStores.js";

const APPLES = "00000000-0000-4000-8000-000000000001";
const BREAD = "00000000-0000-4000-8000-000000000011";
const RETIRED = "00000000-0000-4000-8000-000000000099";
const MISSING = "00000000-0000-4000-8000-0000000000ff";

const customer = {
  firstName: "Lee",
  lastName: "Nguyen",
  phone: "(408) 555-0100",
  email: "lee@ofs.com",
  password: "carrots123",
  securityQuestion: "What was the name of your last pet?",
  securityAnswer: "Fluffy",
};

describe("cart API", () => {
  let memory: ReturnType<typeof createMemoryStore>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    memory = createMemoryStore();
    const cart = createMemoryCartStore([
      { productId: APPLES, name: "Gala Apples", price: 1.49, weightLbs: 1, quantityInStock: 5, active: true },
      { productId: BREAD, name: "Whole Grain Bread", price: 4.19, weightLbs: 1.2, quantityInStock: 11, active: true },
      { productId: RETIRED, name: "Old Cereal", price: 2, weightLbs: 1, quantityInStock: 9, active: false },
    ]);
    app = createApp({
      store: memory.store,
      cartStore: cart.cartStore,
      orderStore: createMemoryOrderStore(cart).orderStore,
      appUrl: "http://localhost:5173",
      secureCookies: false,
      checkDatabase: async () => {},
    });
  });

  async function loggedInCustomer() {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(customer);
    return agent;
  }

  it("requires a logged-in customer", async () => {
    const anonymous = await request(app).get("/api/cart");
    expect(anonymous.status).toBe(401);

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
    const manager = request.agent(app);
    await manager.post("/api/auth/login").send({ email: "manager@ofs.com", password: "manager123", role: "manager" });
    const res = await manager.get("/api/cart");
    expect(res.status).toBe(403);
  });

  it("starts empty and adds items, combining repeat adds", async () => {
    const agent = await loggedInCustomer();
    expect((await agent.get("/api/cart")).body).toEqual({ items: [] });

    await agent.post("/api/cart/items").send({ productId: APPLES, quantity: 2 });
    await agent.post("/api/cart/items").send({ productId: BREAD });
    const res = await agent.post("/api/cart/items").send({ productId: APPLES, quantity: 1 });

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([
      expect.objectContaining({ productId: APPLES, name: "Gala Apples", price: 1.49, weightLbs: 1, quantity: 3 }),
      expect.objectContaining({ productId: BREAD, quantity: 1 }),
    ]);
    expect((await agent.get("/api/cart")).body.items).toHaveLength(2);
  });

  it("keeps each customer's cart separate", async () => {
    const lee = await loggedInCustomer();
    await lee.post("/api/cart/items").send({ productId: APPLES });

    const sam = request.agent(app);
    await sam.post("/api/auth/register").send({ ...customer, email: "sam@ofs.com" });
    expect((await sam.get("/api/cart")).body.items).toEqual([]);
  });

  it("won't add more than is in stock", async () => {
    const agent = await loggedInCustomer();
    await agent.post("/api/cart/items").send({ productId: APPLES, quantity: 4 });

    const res = await agent.post("/api/cart/items").send({ productId: APPLES, quantity: 2 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Only 5 of Gala Apples are in stock.");
    expect((await agent.get("/api/cart")).body.items[0].quantity).toBe(4);
  });

  it("rejects unknown, inactive, and badly formed products", async () => {
    const agent = await loggedInCustomer();
    expect((await agent.post("/api/cart/items").send({ productId: MISSING })).status).toBe(404);
    expect((await agent.post("/api/cart/items").send({ productId: RETIRED })).status).toBe(404);
    expect((await agent.post("/api/cart/items").send({ productId: "apple-gala" })).status).toBe(404);
    expect((await agent.post("/api/cart/items").send({ productId: APPLES, quantity: 0 })).status).toBe(400);
    expect((await agent.post("/api/cart/items").send({ productId: APPLES, quantity: 1.5 })).status).toBe(400);
  });

  it("sets an item's quantity", async () => {
    const agent = await loggedInCustomer();
    await agent.post("/api/cart/items").send({ productId: APPLES, quantity: 1 });

    const res = await agent.patch(`/api/cart/items/${APPLES}`).send({ quantity: 5 });
    expect(res.status).toBe(200);
    expect(res.body.items[0].quantity).toBe(5);

    expect((await agent.patch(`/api/cart/items/${APPLES}`).send({ quantity: 6 })).status).toBe(409);
    expect((await agent.patch(`/api/cart/items/${APPLES}`).send({ quantity: 0 })).status).toBe(400);
    expect((await agent.patch(`/api/cart/items/${BREAD}`).send({ quantity: 1 })).status).toBe(404);
  });

  it("removes an item", async () => {
    const agent = await loggedInCustomer();
    await agent.post("/api/cart/items").send({ productId: APPLES });
    await agent.post("/api/cart/items").send({ productId: BREAD });

    const res = await agent.delete(`/api/cart/items/${APPLES}`);
    expect(res.status).toBe(200);
    expect(res.body.items.map((item: { productId: string }) => item.productId)).toEqual([BREAD]);
  });
});
