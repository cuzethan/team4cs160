import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createMemoryCartStore, createMemoryOrderStore, createMemoryProductStore, createMemoryStore } from "./memoryStores.js";

describe("products API", () => {
  it("lists active products without needing a login", async () => {
    const cart = createMemoryCartStore([
      { productId: "p-bread", name: "Whole Grain Bread", category: "Grains", unit: "loaf", price: 4.19, weightLbs: 1.2, quantityInStock: 11, active: true },
      { productId: "p-apples", name: "Gala Apples", category: "Fruits", unit: "lb", price: 1.49, weightLbs: 1, quantityInStock: 34, active: true },
      { productId: "p-old", name: "Old Cereal", category: "Grains", unit: "box", price: 2, weightLbs: 1, quantityInStock: 9, active: false },
    ]);
    const app = createApp({
      store: createMemoryStore().store,
      cartStore: cart.cartStore,
      orderStore: createMemoryOrderStore(cart).orderStore,
      productStore: createMemoryProductStore(cart).productStore,
      salesStore: { listSales: async () => [], listSalesAnalytics: async () => ({ profitBuckets: [], items: [], categories: [] }) },
      deliveryStore: { listDeliveries: async () => [] },
      appUrl: "http://localhost:5173",
      secureCookies: false,
      checkDatabase: async () => {},
    });

    const res = await request(app).get("/api/products");
    expect(res.status).toBe(200);
    expect(res.body.products.map((product: { name: string }) => product.name)).toEqual(["Gala Apples", "Whole Grain Bread"]);
    expect(res.body.products[0]).toMatchObject({ id: "p-apples", category: "Fruits", unit: "lb", price: 1.49, quantityInStock: 34 });
  });
});
