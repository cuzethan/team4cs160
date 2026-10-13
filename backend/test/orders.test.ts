import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createMemoryCartStore, createMemoryOrderStore, createMemoryProductStore, createMemoryStore } from "./memoryStores.js";

const APPLES = "00000000-0000-4000-8000-000000000001";
const RICE = "00000000-0000-4000-8000-000000000010";

const customer = {
  firstName: "Lee",
  lastName: "Nguyen",
  phone: "(408) 555-0100",
  email: "lee@ofs.com",
  password: "carrots123",
  securityQuestion: "What was the name of your last pet?",
  securityAnswer: "Fluffy",
};

const address = {
  street: "1 Washington Sq",
  city: "San Jose",
  state: "CA",
  zipCode: "95192",
  deliveryInstructions: "Leave at the front desk",
};

describe("orders API", () => {
  let cart: ReturnType<typeof createMemoryCartStore>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    cart = createMemoryCartStore([
      { productId: APPLES, name: "Gala Apples", category: "Test", unit: "each", price: 1.49, weightLbs: 1, quantityInStock: 5, active: true },
      { productId: RICE, name: "Jasmine Rice", category: "Test", unit: "each", price: 5.99, weightLbs: 2, quantityInStock: 20, active: true },
    ]);
    app = createApp({
      store: createMemoryStore().store,
      cartStore: cart.cartStore,
      orderStore: createMemoryOrderStore(cart).orderStore,
      productStore: createMemoryProductStore(cart).productStore,
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
    expect((await request(app).post("/api/orders").send({ address })).status).toBe(401);
    expect((await request(app).get("/api/orders/mine")).status).toBe(401);
  });

  it("places an order from the cart, empties the cart, and lists it", async () => {
    const agent = await loggedInCustomer();
    await agent.post("/api/cart/items").send({ productId: APPLES, quantity: 2 });
    await agent.post("/api/cart/items").send({ productId: RICE, quantity: 1 });

    const res = await agent.post("/api/orders").send({ address });
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({
      orderStatus: "placed",
      paymentStatus: "paid",
      subtotal: 8.97,
      totalWeight: 4,
      deliveryFee: 0,
      grandTotal: 8.97,
    });
    expect(res.body.order.items).toHaveLength(2);

    expect((await agent.get("/api/cart")).body.items).toEqual([]);
    expect(cart.products.get(APPLES)!.quantityInStock).toBe(3);

    const mine = await agent.get("/api/orders/mine");
    expect(mine.body.orders.map((order: { orderId: string }) => order.orderId)).toEqual([res.body.order.orderId]);
  });

  it("charges the delivery fee at 20 lbs or more", async () => {
    const agent = await loggedInCustomer();
    await agent.post("/api/cart/items").send({ productId: RICE, quantity: 10 });

    const res = await agent.post("/api/orders").send({ address });
    expect(res.body.order).toMatchObject({ subtotal: 59.9, totalWeight: 20, deliveryFee: 10, grandTotal: 69.9 });
  });

  it("refuses an empty cart, a missing address, or too little stock", async () => {
    const agent = await loggedInCustomer();
    expect((await agent.post("/api/orders").send({ address })).body.error).toBe("Your cart is empty.");

    await agent.post("/api/cart/items").send({ productId: APPLES, quantity: 4 });
    expect((await agent.post("/api/orders").send({ address: { ...address, city: " " } })).status).toBe(400);
    expect((await agent.post("/api/orders").send({ address: { ...address, zipCode: "9519" } })).status).toBe(400);

    cart.products.get(APPLES)!.quantityInStock = 3;
    const res = await agent.post("/api/orders").send({ address });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Only 3 of Gala Apples left in stock. Update your cart to continue.");
    expect((await agent.get("/api/cart")).body.items).toHaveLength(1);
  });
});
