import bcrypt from "bcryptjs";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createMemoryCartStore, createMemoryOrderStore, createMemoryProductStore, createMemorySettingsStore, createMemoryStore } from "./memoryStores.js";

describe("global delivery settings", () => {
  it("loads defaults, restricts updates, validates values, and prices checkout from saved settings", async () => {
    const memory = createMemoryStore();
    const settings = createMemorySettingsStore();
    const cart = createMemoryCartStore([
      { productId: "00000000-0000-4000-8000-000000000001", name: "Heavy item", category: "Test", unit: "each", price: 5, weightLbs: 20, quantityInStock: 5, active: true },
    ]);
    let paidAmount = 0;
    let customerId = "";
    const app = createApp({
      store: memory.store, settingsStore: settings.settingsStore, cartStore: cart.cartStore,
      orderStore: createMemoryOrderStore(cart, settings.settingsStore).orderStore,
      productStore: createMemoryProductStore(cart).productStore, salesStore: {
        listSales: async () => [], listSalesAnalytics: async () => ({ profitBuckets: [], items: [], categories: [] }),
      },
      deliveryStore: { listDeliveries: async () => [] },
      payments: {
        async create({ amountCents }) { paidAmount = amountCents; return { clientSecret: "secret" }; },
        async retrieveSucceeded(id) { return { id, amountCents: paidAmount, userId: customerId }; },
      },
      appUrl: "http://localhost:5173", secureCookies: false, checkDatabase: async () => {},
    });

    expect((await request(app).get("/api/settings")).body).toEqual({ deliveryFee: 10, freeDeliveryWeightThreshold: 20 });
    expect((await request(app).put("/api/settings").send({ deliveryFee: 3.5, freeDeliveryWeightThreshold: 15 })).status).toBe(401);
    const customer = request.agent(app);
    const registration = await customer.post("/api/auth/register").send({ firstName: "Lee", lastName: "Nguyen", phone: "4085550100", email: "lee@example.com", password: "carrots123", securityQuestion: "What was the name of your last pet?", securityAnswer: "Cat" });
    customerId = registration.body.user.id;
    expect((await customer.put("/api/settings").send({ deliveryFee: 3.5, freeDeliveryWeightThreshold: 15 })).status).toBe(403);

    await memory.store.createUser({ firstName: "Max", lastName: "Boss", phone: "000", email: "manager@example.com", passwordHash: await bcrypt.hash("manager123", 4), role: "admin", questionChoice: "What was the name of your last pet?", answerHash: "unused" });
    const manager = request.agent(app);
    await manager.post("/api/auth/login").send({ email: "manager@example.com", password: "manager123", role: "manager" });
    expect((await manager.put("/api/settings").send({ deliveryFee: -1, freeDeliveryWeightThreshold: 15 })).status).toBe(400);
    expect((await manager.put("/api/settings").send({ deliveryFee: 3.5, freeDeliveryWeightThreshold: 0 })).status).toBe(400);
    expect((await manager.put("/api/settings").send({ deliveryFee: 3.5, freeDeliveryWeightThreshold: 15 })).body).toEqual({ deliveryFee: 3.5, freeDeliveryWeightThreshold: 15 });

    await customer.post("/api/cart/items").send({ productId: "00000000-0000-4000-8000-000000000001" });
    const intent = await customer.post("/api/orders/payment-intent");
    expect(intent.status).toBe(200);
    expect(paidAmount).toBe(850);
    await manager.put("/api/settings").send({ deliveryFee: 4, freeDeliveryWeightThreshold: 15 });
    const staleCheckout = await customer.post("/api/orders").send({
      address: { street: "1 Main St", city: "San Jose", state: "CA", zipCode: "95112" },
      paymentIntentId: "intent",
    });
    expect(staleCheckout.status).toBe(409);
  });
});
