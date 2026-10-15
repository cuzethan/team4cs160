import bcrypt from "bcryptjs";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { createMemoryCartStore, createMemoryOrderStore, createMemoryProductStore, createMemoryStore } from "./memoryStores.js";

describe("manager deliveries API", () => {
  it("restricts delivery data to managers and returns order progress", async () => {
    const memory = createMemoryStore();
    const cart = createMemoryCartStore([]);
    const deliveries = [{
      orderId: "order-1",
      customerName: "Lee Nguyen",
      deliveryProgress: "Awaiting dispatch",
      eta: null,
    }];
    const listDeliveries = vi.fn(async () => deliveries);
    const app = createApp({
      store: memory.store,
      cartStore: cart.cartStore,
      orderStore: createMemoryOrderStore(cart).orderStore,
      productStore: createMemoryProductStore(cart).productStore,
      salesStore: { listSales: async () => [] },
      deliveryStore: { listDeliveries },
      appUrl: "http://localhost:5173",
      secureCookies: false,
      checkDatabase: async () => {},
    });

    expect((await request(app).get("/api/manager/deliveries")).status).toBe(401);

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
    expect((await customer.get("/api/manager/deliveries")).status).toBe(403);

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
    await manager.post("/api/auth/login").send({
      email: "manager@ofs.com",
      password: "manager123",
      role: "manager",
    });

    const response = await manager.get("/api/manager/deliveries");
    expect(response.status).toBe(200);
    expect(response.body.deliveries).toEqual(deliveries);
    expect(listDeliveries).toHaveBeenCalledOnce();
  });
});
