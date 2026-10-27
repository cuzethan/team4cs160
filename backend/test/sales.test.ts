import bcrypt from "bcryptjs";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { SalesRange } from "../src/store.js";
import { createMemoryCartStore, createMemoryOrderStore, createMemoryProductStore, createMemoryStore } from "./memoryStores.js";

describe("manager sales API", () => {
  it("restricts sales data to managers and returns selected payment buckets", async () => {
    const memory = createMemoryStore();
    const cart = createMemoryCartStore([]);
    const buckets = [
      { bucketStart: new Date("2026-10-08T00:00:00.000Z"), paidOrders: 0, revenue: 0 },
      { bucketStart: new Date("2026-10-14T00:00:00.000Z"), paidOrders: 2, revenue: 31.5 },
    ];
    const listSales = vi.fn(async (_range: SalesRange) => buckets);
    const analytics = {
      profitBuckets: [{ bucketStart: new Date("2026-10-14T00:00:00.000Z"), profit: 12, unknownCostQuantity: 2 }],
      items: [],
      categories: [],
    };
    const listSalesAnalytics = vi.fn(async (_range: SalesRange) => analytics);
    const app = createApp({
      store: memory.store,
      cartStore: cart.cartStore,
      orderStore: createMemoryOrderStore(cart).orderStore,
      productStore: createMemoryProductStore(cart).productStore,
      salesStore: { listSales, listSalesAnalytics },
      deliveryStore: { listDeliveries: async () => [] },
      appUrl: "http://localhost:5173",
      secureCookies: false,
      checkDatabase: async () => {},
    });

    expect((await request(app).get("/api/manager/sales")).status).toBe(401);
    expect((await request(app).get("/api/manager/sales/analytics")).status).toBe(401);

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
    expect((await customer.get("/api/manager/sales")).status).toBe(403);
    expect((await customer.get("/api/manager/sales/analytics")).status).toBe(403);

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

    const response = await manager.get("/api/manager/sales?range=week");
    expect(response.status).toBe(200);
    expect(response.body.sales).toEqual(buckets.map((bucket) => ({ ...bucket, bucketStart: bucket.bucketStart.toISOString() })));
    expect(listSales).toHaveBeenCalledWith("week");
    expect((await manager.get("/api/manager/sales?range=invalid")).status).toBe(400);
    const analyticsResponse = await manager.get("/api/manager/sales/analytics?range=week");
    expect(analyticsResponse.status).toBe(200);
    expect(analyticsResponse.body.analytics).toEqual({
      ...analytics,
      profitBuckets: analytics.profitBuckets.map((bucket) => ({ ...bucket, bucketStart: bucket.bucketStart.toISOString() })),
    });
    expect(listSalesAnalytics).toHaveBeenCalledWith("week");
    expect((await manager.get("/api/manager/sales/analytics?range=invalid")).status).toBe(400);
  });
});