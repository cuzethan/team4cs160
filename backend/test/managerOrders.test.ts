import bcrypt from "bcryptjs";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { ConfirmedPayment } from "../src/payments.js";
import { createMemoryCartStore, createMemoryOrderStore, createMemoryProductStore, createMemoryStore } from "./memoryStores.js";

const APPLES = "00000000-0000-4000-8000-000000000001";

const address = {
  street: "1 Washington Sq",
  city: "San Jose",
  state: "CA",
  zipCode: "95192",
  deliveryInstructions: "",
};

async function setup() {
  let confirmedPayment: ConfirmedPayment | null = null;
  const memory = createMemoryStore();
  const cart = createMemoryCartStore([
    { productId: APPLES, name: "Gala Apples", category: "Fruits", unit: "each", price: 1.5, unitCost: 0.8, weightLbs: 1, quantityInStock: 20, active: true },
  ]);
  const app = createApp({
    store: memory.store,
    cartStore: cart.cartStore,
    orderStore: createMemoryOrderStore(cart).orderStore,
    productStore: createMemoryProductStore(cart).productStore,
    salesStore: { listSales: async () => [], listSalesAnalytics: async () => ({ profitBuckets: [], items: [], categories: [], deliveryFees: { collected: 0, ordersWithFee: 0 } }) },
    deliveryStore: { listDeliveries: async () => [] },
    payments: {
      async create() {
        return { clientSecret: "pi_test_secret" };
      },
      async retrieveSucceeded(id) {
        return confirmedPayment?.id === id ? confirmedPayment : null;
      },
      async retrieveFailure() {
        return null;
      },
    },
    geocodeDeliveryAddress: async () => ({ latitude: 37.3382, longitude: -121.8863 }),
    appUrl: "http://localhost:5173",
    secureCookies: false,
    checkDatabase: async () => {},
  });

  const customer = request.agent(app);
  const registered = await customer.post("/api/auth/register").send({
    firstName: "Lee",
    lastName: "Nguyen",
    phone: "408-555-0100",
    email: "lee@ofs.com",
    password: "carrots123",
    securityQuestion: "What was the name of your last pet?",
    securityAnswer: "Fluffy",
  });
  const customerId = registered.body.user.id as string;

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

  const placeOrder = async (quantity: number) => {
    await customer.post("/api/cart/items").send({ productId: APPLES, quantity });
    confirmedPayment = { id: `pi_${quantity}`, amountCents: Math.round(quantity * 150), userId: customerId };
    return customer.post("/api/orders").send({ address, paymentIntentId: `pi_${quantity}` });
  };

  return { app, customer, manager, customerId, placeOrder };
}

describe("manager orders API", () => {
  it("is for managers only", async () => {
    const { app, customer } = await setup();
    expect((await request(app).get("/api/manager/orders")).status).toBe(401);
    expect((await customer.get("/api/manager/orders")).status).toBe(403);
  });

  it("lists every order, newest first, with who placed it and what they bought", async () => {
    const { manager, customerId, placeOrder } = await setup();
    expect((await placeOrder(2)).status).toBe(201);
    expect((await placeOrder(3)).status).toBe(201);

    const response = await manager.get("/api/manager/orders");
    expect(response.status).toBe(200);
    expect(response.body.orders).toHaveLength(2);
    expect(response.body.orders[0]).toMatchObject({
      customerId,
      customerName: "Lee Nguyen",
      customerEmail: "lee@ofs.com",
      orderStatus: "placed",
      paymentStatus: "paid",
      grandTotal: 4.5,
      items: [expect.objectContaining({ productName: "Gala Apples", quantity: 3 })],
    });
    expect(response.body.orders[1].items[0].quantity).toBe(2);
  });
});
