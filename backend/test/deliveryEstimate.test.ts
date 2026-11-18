import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { estimateDeliveryMinutes } from "../src/deliveryArea.js";
import { createMemoryCartStore, createMemoryOrderStore, createMemoryProductStore, createMemoryStore } from "./memoryStores.js";

describe("delivery time estimate", () => {
  it("adds packing time to walking-pace travel and rounds up to five minutes", () => {
    expect(estimateDeliveryMinutes(0)).toBe(30);
    // 1 mile of straight line is about 1.3 miles of streets: ~29 minutes at 1.2 m/s.
    expect(estimateDeliveryMinutes(1)).toBe(60);
    expect(estimateDeliveryMinutes(3)).toBe(120);
    expect(estimateDeliveryMinutes(2.2) % 5).toBe(0);
  });

  it("is returned when checkout checks the delivery address", async () => {
    const cart = createMemoryCartStore([]);
    const app = createApp({
      store: createMemoryStore().store,
      cartStore: cart.cartStore,
      orderStore: createMemoryOrderStore(cart).orderStore,
      productStore: createMemoryProductStore(cart).productStore,
      salesStore: { listSales: async () => [], listSalesAnalytics: async () => ({ profitBuckets: [], items: [], categories: [], deliveryFees: { collected: 0, ordersWithFee: 0 } }) },
      deliveryStore: { listDeliveries: async () => [] },
      // About one mile north of the default store location in downtown San Jose.
      geocodeDeliveryAddress: async () => ({ latitude: 37.3527, longitude: -121.8863 }),
      appUrl: "http://localhost:5173",
      secureCookies: false,
      checkDatabase: async () => {},
    });
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

    const response = await customer.post("/api/orders/validate-address").send({
      address: { street: "1 Main St", city: "San Jose", state: "CA", zipCode: "95112" },
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ eligible: true, estimatedMinutes: 60 });
  });
});
