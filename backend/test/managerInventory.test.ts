import bcrypt from "bcryptjs";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createMemoryCartStore, createMemoryOrderStore, createMemoryProductStore, createMemoryStore } from "./memoryStores.js";

describe("manager inventory API", () => {
  it("allows managers to add and subtract stock without allowing stock below zero", async () => {
    const memory = createMemoryStore();
    const cart = createMemoryCartStore([
      { productId: "p-apples", name: "Gala Apples", category: "Fruits", unit: "lb", price: 1.49, weightLbs: 1, quantityInStock: 2, active: true },
    ]);
    const app = createApp({
      store: memory.store,
      cartStore: cart.cartStore,
      orderStore: createMemoryOrderStore(cart).orderStore,
      productStore: createMemoryProductStore(cart).productStore,
      salesStore: { listSales: async () => [] },
      appUrl: "http://localhost:5173",
      secureCookies: false,
      checkDatabase: async () => {},
    });

    const path = "/api/manager/inventory/p-apples/stock";
    expect((await request(app).patch(path).send({ adjustment: 1 })).status).toBe(401);

    const customer = request.agent(app);
    await customer.post("/api/auth/register").send({
      firstName: "Lee",
      lastName: "Nguyen",
      phone: "408-555-0100",
      email: "lee@ofs.com",
      password: "carrots123",
      securityQuestion: "What was the name of your last pet?",
      securityAnswer: "Fluffy",
    });
    expect((await customer.patch(path).send({ adjustment: 1 })).status).toBe(403);

    await memory.store.createUser({
      firstName: "Max",
      lastName: "Boss",
      phone: "408-555-0110",
      email: "manager@ofs.com",
      passwordHash: await bcrypt.hash("manager123", 4),
      role: "admin",
      questionChoice: "What was the name of your last pet?",
      answerHash: "unused",
    });
    const manager = request.agent(app);
    await manager.post("/api/auth/login").send({ email: "manager@ofs.com", password: "manager123", role: "manager" });

    const added = await manager.patch(path).send({ adjustment: 3 });
    expect(added.status).toBe(200);
    expect(added.body.quantityInStock).toBe(5);

    const removed = await manager.patch(path).send({ adjustment: -5 });
    expect(removed.status).toBe(200);
    expect(removed.body.quantityInStock).toBe(0);
    expect((await manager.patch(path).send({ adjustment: -1 })).status).toBe(409);
    expect((await manager.patch(path).send({ adjustment: 0 })).status).toBe(400);
    expect((await manager.patch("/api/manager/inventory/missing/stock").send({ adjustment: 1 })).status).toBe(404);
    expect((await manager.get("/api/products")).body.products[0].quantityInStock).toBe(0);
  });
});
