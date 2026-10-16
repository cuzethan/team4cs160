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
      deliveryStore: { listDeliveries: async () => [] },
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

describe("manager product management API", () => {
  async function setup() {
    const memory = createMemoryStore();
    const cart = createMemoryCartStore([
      { productId: "p-apples", name: "Gala Apples", category: "Fruits", unit: "lb", price: 1.49, weightLbs: 1, quantityInStock: 10, active: true },
      { productId: "p-rice", name: "Jasmine Rice", category: "Grains", unit: "bag", price: 5.99, weightLbs: 2, quantityInStock: 4, active: true },
    ]);
    const products = createMemoryProductStore(cart);
    const app = createApp({
      store: memory.store,
      cartStore: cart.cartStore,
      orderStore: createMemoryOrderStore(cart).orderStore,
      productStore: products.productStore,
      salesStore: { listSales: async () => [] },
      deliveryStore: { listDeliveries: async () => [] },
      appUrl: "http://localhost:5173",
      secureCookies: false,
      checkDatabase: async () => {},
    });

    const managerUser = await memory.store.createUser({
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

    return { app, manager, customer, managerUser, products };
  }

  const newProduct = {
    name: "Red Lentils",
    description: "Split red lentils",
    price: 3.25,
    weightLbs: 1,
    unit: "bag",
    categoryId: "cat-Grains",
    quantityInStock: 200,
  };

  it("lets only managers list, add, and edit products", async () => {
    const { app, customer } = await setup();
    expect((await request(app).get("/api/manager/inventory")).status).toBe(401);
    expect((await customer.get("/api/manager/inventory")).status).toBe(403);
    expect((await customer.post("/api/manager/inventory").send(newProduct)).status).toBe(403);
    expect((await customer.patch("/api/manager/inventory/p-apples").send({ price: 2 })).status).toBe(403);
  });

  it("lists every product with the categories to choose from", async () => {
    const { manager } = await setup();
    const res = await manager.get("/api/manager/inventory");
    expect(res.status).toBe(200);
    expect(res.body.categories).toEqual([{ id: "cat-Fruits", name: "Fruits" }, { id: "cat-Grains", name: "Grains" }]);
    expect(res.body.products.map((product: { name: string }) => product.name)).toEqual(["Gala Apples", "Jasmine Rice"]);
    expect(res.body.products[0]).toMatchObject({ categoryId: "cat-Fruits", active: true });
  });

  it("adds a product that shoppers can see, logging its starting stock", async () => {
    const { manager, managerUser, products } = await setup();
    const res = await manager.post("/api/manager/inventory").send(newProduct);
    expect(res.status).toBe(201);
    expect(res.body.product).toMatchObject({ name: "Red Lentils", category: "Grains", price: 3.25, quantityInStock: 200, active: true });

    const catalog = (await manager.get("/api/products")).body.products;
    expect(catalog.map((product: { name: string }) => product.name)).toContain("Red Lentils");
    expect(products.transactions).toEqual([
      expect.objectContaining({ userId: managerUser.userId, quantityChanged: 200, quantityAfterChange: 200, reason: "Initial stock" }),
    ]);
  });

  it("rejects products with missing or invalid fields", async () => {
    const { manager } = await setup();
    const post = (body: object) => manager.post("/api/manager/inventory").send({ ...newProduct, ...body });
    expect((await post({ name: "  " })).status).toBe(400);
    expect((await post({ price: -1 })).status).toBe(400);
    expect((await post({ price: "3" })).status).toBe(400);
    expect((await post({ weightLbs: 0 })).status).toBe(400);
    expect((await post({ unit: "" })).status).toBe(400);
    expect((await post({ categoryId: "cat-Candy" })).status).toBe(400);
    expect((await post({ quantityInStock: -5 })).status).toBe(400);
    expect((await post({ quantityInStock: 1.5 })).status).toBe(400);
    const { categoryId: _categoryId, ...noCategory } = newProduct;
    expect((await manager.post("/api/manager/inventory").send(noCategory)).status).toBe(400);
  });

  it("edits a product and records price changes", async () => {
    const { manager, managerUser, products } = await setup();
    const res = await manager.patch("/api/manager/inventory/p-apples").send({ price: 1.79, weightLbs: 1.5, categoryId: "cat-Grains" });
    expect(res.status).toBe(200);
    expect(res.body.product).toMatchObject({ name: "Gala Apples", price: 1.79, weightLbs: 1.5, category: "Grains" });
    expect(products.priceHistory).toEqual([{ productId: "p-apples", changedBy: managerUser.userId, oldPrice: 1.49, newPrice: 1.79 }]);

    expect((await manager.patch("/api/manager/inventory/p-apples").send({ name: "Gala Apples" })).status).toBe(200);
    expect(products.priceHistory).toHaveLength(1);
  });

  it("refuses empty or invalid edits and unknown products", async () => {
    const { manager } = await setup();
    expect((await manager.patch("/api/manager/inventory/p-apples").send({})).status).toBe(400);
    expect((await manager.patch("/api/manager/inventory/p-apples").send({ price: -2 })).status).toBe(400);
    expect((await manager.patch("/api/manager/inventory/p-apples").send({ active: "no" })).status).toBe(400);
    expect((await manager.patch("/api/manager/inventory/missing").send({ price: 2 })).status).toBe(404);
  });

  it("deactivates a product so shoppers can't see or buy it, then restores it", async () => {
    const { manager, customer } = await setup();
    const res = await manager.patch("/api/manager/inventory/p-rice").send({ active: false });
    expect(res.body.product.active).toBe(false);

    const catalog = (await customer.get("/api/products")).body.products;
    expect(catalog.map((product: { name: string }) => product.name)).toEqual(["Gala Apples"]);
    expect((await customer.post("/api/cart/items").send({ productId: "p-rice" })).status).toBe(404);
    expect((await manager.get("/api/manager/inventory")).body.products.at(-1)).toMatchObject({ name: "Jasmine Rice", active: false });

    await manager.patch("/api/manager/inventory/p-rice").send({ active: true });
    expect((await customer.get("/api/products")).body.products).toHaveLength(2);
  });

  it("logs who changed stock and why", async () => {
    const { manager, managerUser, products } = await setup();
    await manager.patch("/api/manager/inventory/p-apples/stock").send({ adjustment: 100, reason: " Weekly delivery " });
    await manager.patch("/api/manager/inventory/p-apples/stock").send({ adjustment: -3 });
    expect(products.transactions).toEqual([
      { userId: managerUser.userId, productId: "p-apples", quantityChanged: 100, quantityAfterChange: 110, reason: "Weekly delivery" },
      { userId: managerUser.userId, productId: "p-apples", quantityChanged: -3, quantityAfterChange: 107, reason: "Manual adjustment" },
    ]);
    expect((await manager.patch("/api/manager/inventory/p-apples/stock").send({ adjustment: 1, reason: "x".repeat(201) })).status).toBe(400);
  });
});
