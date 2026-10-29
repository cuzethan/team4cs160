import bcrypt from "bcryptjs";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import {
  createMemoryCartStore,
  createMemoryDeliveryStore,
  createMemoryOrderStore,
  createMemoryProductStore,
  createMemoryStore,
} from "./memoryStores.js";

const APPLES = "00000000-0000-4000-8000-000000000001";

async function managerAgent(app: ReturnType<typeof createApp>, memory: ReturnType<typeof createMemoryStore>) {
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
  return manager;
}

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
      salesStore: { listSales: async () => [], listSalesAnalytics: async () => ({ profitBuckets: [], items: [], categories: [] }) },
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

    const manager = await managerAgent(app, memory);
    const response = await manager.get("/api/manager/deliveries");
    expect(response.status).toBe(200);
    expect(response.body.deliveries).toEqual(deliveries);
    expect(listDeliveries).toHaveBeenCalledOnce();
  });

  it("lets managers recall a robot and reports a cancelled active run", async () => {
    const memory = createMemoryStore();
    const cart = createMemoryCartStore([]);
    const recallRobot = vi.fn(async () => ({ status: "returning" as const, returnRunId: "run-2", cancelledRunId: "run-1" }));
    const app = createApp({
      store: memory.store,
      cartStore: cart.cartStore,
      orderStore: createMemoryOrderStore(cart).orderStore,
      productStore: createMemoryProductStore(cart).productStore,
      salesStore: { listSales: async () => [], listSalesAnalytics: async () => ({ profitBuckets: [], items: [], categories: [] }) },
      deliveryStore: { listDeliveries: async () => [], recallRobot },
      appUrl: "http://localhost:5173",
      secureCookies: false,
      checkDatabase: async () => {},
    });

    const manager = await managerAgent(app, memory);
    const response = await manager.post("/api/manager/deliveries/robots/robot-1/recall");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ robotId: "robot-1", status: "returning", returnRunId: "run-2", cancelledRunId: "run-1" });
    expect(recallRobot).toHaveBeenCalledWith("robot-1");
  });

  it("prevents a recall when the robot is already at home base", async () => {
    const memory = createMemoryStore();
    const cart = createMemoryCartStore([]);
    const recallRobot = vi.fn(async () => ({ status: "already-at-base" as const, returnRunId: null, cancelledRunId: null }));
    const app = createApp({
      store: memory.store,
      cartStore: cart.cartStore,
      orderStore: createMemoryOrderStore(cart).orderStore,
      productStore: createMemoryProductStore(cart).productStore,
      salesStore: { listSales: async () => [], listSalesAnalytics: async () => ({ profitBuckets: [], items: [], categories: [] }) },
      deliveryStore: { listDeliveries: async () => [], recallRobot },
      appUrl: "http://localhost:5173",
      secureCookies: false,
      checkDatabase: async () => {},
    });

    const manager = await managerAgent(app, memory);
    const response = await manager.post("/api/manager/deliveries/robots/robot-1/recall");

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("This robot is already at the configured home base.");
  });

  it("refunds an undispatched paid order and restocks its items", async () => {
    const memory = createMemoryStore();
    const cart = createMemoryCartStore([
      { productId: APPLES, name: "Gala Apples", category: "Fruits", unit: "lb", price: 1.49, unitCost: 0.8, weightLbs: 1, quantityInStock: 2, active: true },
    ]);
    const { deliveryStore, transactions } = createMemoryDeliveryStore(cart.products, [{
      orderId: "order-awaiting",
      customerName: "Lee Nguyen",
      paymentStatus: "paid",
      orderStatus: "placed",
      activeDelivery: false,
      items: [{ productId: APPLES, quantity: 3 }],
    }]);
    const app = createApp({
      store: memory.store,
      cartStore: cart.cartStore,
      orderStore: createMemoryOrderStore(cart).orderStore,
      productStore: createMemoryProductStore(cart).productStore,
      salesStore: { listSales: async () => [], listSalesAnalytics: async () => ({ profitBuckets: [], items: [], categories: [] }) },
      deliveryStore,
      appUrl: "http://localhost:5173",
      secureCookies: false,
      checkDatabase: async () => {},
    });
    const manager = await managerAgent(app, memory);

    const response = await manager.post("/api/manager/deliveries/order-awaiting/refund");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      orderId: "order-awaiting",
      paymentStatus: "refunded",
      orderStatus: "cancelled",
    });
    expect(cart.products.get(APPLES)?.quantityInStock).toBe(5);
    expect(transactions).toEqual([expect.objectContaining({
      productId: APPLES,
      quantityChanged: 3,
      quantityAfterChange: 5,
      reason: "Refund order order-awaiting",
    })]);
    expect((await manager.get("/api/manager/deliveries")).body.deliveries).toEqual([]);
  });

  it("blocks refunds once an order is on a robot run", async () => {
    const memory = createMemoryStore();
    const cart = createMemoryCartStore([
      { productId: APPLES, name: "Gala Apples", category: "Fruits", unit: "lb", price: 1.49, unitCost: 0.8, weightLbs: 1, quantityInStock: 2, active: true },
    ]);
    const { deliveryStore } = createMemoryDeliveryStore(cart.products, [{
      orderId: "order-dispatched",
      customerName: "Lee Nguyen",
      paymentStatus: "paid",
      orderStatus: "out_for_delivery",
      activeDelivery: true,
      items: [{ productId: APPLES, quantity: 1 }],
    }]);
    const app = createApp({
      store: memory.store,
      cartStore: cart.cartStore,
      orderStore: createMemoryOrderStore(cart).orderStore,
      productStore: createMemoryProductStore(cart).productStore,
      salesStore: { listSales: async () => [], listSalesAnalytics: async () => ({ profitBuckets: [], items: [], categories: [] }) },
      deliveryStore,
      appUrl: "http://localhost:5173",
      secureCookies: false,
      checkDatabase: async () => {},
    });
    const manager = await managerAgent(app, memory);

    const response = await manager.post("/api/manager/deliveries/order-dispatched/refund");
    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/cancel the delivery run first/i);
    expect(cart.products.get(APPLES)?.quantityInStock).toBe(2);
  });

  it("rejects refunds for customers and missing orders", async () => {
    const memory = createMemoryStore();
    const cart = createMemoryCartStore([]);
    const refundOrder = vi.fn(async () => "not-found" as const);
    const app = createApp({
      store: memory.store,
      cartStore: cart.cartStore,
      orderStore: createMemoryOrderStore(cart).orderStore,
      productStore: createMemoryProductStore(cart).productStore,
      salesStore: { listSales: async () => [], listSalesAnalytics: async () => ({ profitBuckets: [], items: [], categories: [] }) },
      deliveryStore: { listDeliveries: async () => [], refundOrder },
      appUrl: "http://localhost:5173",
      secureCookies: false,
      checkDatabase: async () => {},
    });

    expect((await request(app).post("/api/manager/deliveries/missing/refund")).status).toBe(401);

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
    expect((await customer.post("/api/manager/deliveries/missing/refund")).status).toBe(403);

    const manager = await managerAgent(app, memory);
    const response = await manager.post("/api/manager/deliveries/missing/refund");
    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Order not found.");
  });
});
