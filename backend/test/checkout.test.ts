import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp, type AppOptions } from "../src/app.js";
import type { FailedPaymentAttempt, PaymentIntentCreator } from "../src/payments.js";
import type { DeliveryStore } from "../src/store.js";
import { createMemoryCartStore, createMemoryOrderStore, createMemoryProductStore, createMemoryStore } from "./memoryStores.js";

const APPLES = "00000000-0000-4000-8000-000000000001";
const address = { street: "1 Washington Sq", city: "San Jose", state: "CA", zipCode: "95192" };

function setup(overrides: Partial<AppOptions> = {}) {
  const cart = createMemoryCartStore([
    { productId: APPLES, name: "Gala Apples", category: "Fruits", unit: "lb", price: 1.49, unitCost: 0.8, weightLbs: 1, quantityInStock: 5, active: true },
  ]);
  const payments: PaymentIntentCreator = {
    create: async () => ({ clientSecret: "secret", customerSessionClientSecret: "session" }),
    retrieveSucceeded: async () => null,
    retrieveFailure: async () => null,
  };
  const app = createApp({
    store: createMemoryStore().store,
    cartStore: cart.cartStore,
    orderStore: createMemoryOrderStore(cart).orderStore,
    productStore: createMemoryProductStore(cart).productStore,
    salesStore: { listSales: async () => [], listSalesAnalytics: async () => ({ profitBuckets: [], items: [], categories: [], deliveryFees: { collected: 0, ordersWithFee: 0 } }) },
    deliveryStore: { listDeliveries: async () => [] },
    payments,
    geocodeDeliveryAddress: async () => ({ latitude: 37.3352, longitude: -121.8811 }),
    appUrl: "http://localhost:5173",
    secureCookies: false,
    checkDatabase: async () => {},
    ...overrides,
  });
  return app;
}

async function shopper(app: ReturnType<typeof createApp>) {
  const agent = request.agent(app);
  const registered = await agent.post("/api/auth/register").send({
    firstName: "Lee", lastName: "Nguyen", phone: "(408) 555-0100", email: "lee@ofs.com", password: "carrots123",
    securityQuestion: "What was the name of your last pet?", securityAnswer: "Fluffy",
  });
  return { agent, userId: registered.body.user.id as string };
}

describe("address suggestions", () => {
  const suggestion = { label: "1 Washington Square, San Jose, CA 95192", street: "1 Washington Square", city: "San Jose", state: "CA", zipCode: "95192" };

  it("suggests addresses for what the shopper typed", async () => {
    const suggestAddresses = vi.fn(async () => [suggestion]);
    const { agent } = await shopper(setup({ suggestAddresses }));

    const res = await agent.get("/api/orders/address-suggestions").query({ q: " 1 Washington " });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ suggestions: [suggestion] });
    expect(suggestAddresses).toHaveBeenCalledWith("1 Washington");
  });

  it("waits for at least three characters", async () => {
    const suggestAddresses = vi.fn(async () => [suggestion]);
    const { agent } = await shopper(setup({ suggestAddresses }));
    expect((await agent.get("/api/orders/address-suggestions").query({ q: "1 " })).body).toEqual({ suggestions: [] });
    expect(suggestAddresses).not.toHaveBeenCalled();
  });

  it("says suggestions are unavailable when the lookup fails", async () => {
    const { agent } = await shopper(setup({ suggestAddresses: async () => { throw new Error("down"); } }));
    const res = await agent.get("/api/orders/address-suggestions").query({ q: "1 Washington" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ suggestions: [], unavailable: true });
  });

  it("suggests the shopper's own past addresses first, even when the lookup is down", async () => {
    const pastAddress = { label: "1 Washington Sq, San Jose, CA 95192", street: "1 Washington Sq", city: "San Jose", state: "CA", zipCode: "95192" };
    const cart = createMemoryCartStore([]);
    const { orderStore } = createMemoryOrderStore(cart);
    orderStore.listAddresses = async () => [{ street: "1 Washington Sq", city: "San Jose", state: "CA", zipCode: "95192", deliveryInstructions: "" }];
    let down = false;
    const { agent } = await shopper(setup({ orderStore, suggestAddresses: async () => { if (down) throw new Error("down"); return [suggestion, pastAddress]; } }));

    expect((await agent.get("/api/orders/address-suggestions").query({ q: "" })).body).toEqual({ suggestions: [pastAddress] });
    expect((await agent.get("/api/orders/address-suggestions").query({ q: "1 wash" })).body).toEqual({ suggestions: [pastAddress, suggestion] });
    down = true;
    expect((await agent.get("/api/orders/address-suggestions").query({ q: "1 wash" })).body).toEqual({ suggestions: [pastAddress], unavailable: true });
    expect((await agent.get("/api/orders/address-suggestions").query({ q: "Story" })).body).toEqual({ suggestions: [], unavailable: true });
  });

  it("only suggests a past address when every typed word starts one of its words", async () => {
    const cart = createMemoryCartStore([]);
    const { orderStore } = createMemoryOrderStore(cart);
    orderStore.listAddresses = async () => [{ street: "4343 Stevens Creek Blvd", city: "Santa Clara", state: "CA", zipCode: "95051", deliveryInstructions: "" }];
    const { agent } = await shopper(setup({ orderStore, suggestAddresses: async () => [] }));
    const labels = async (q: string) => (await agent.get("/api/orders/address-suggestions").query({ q })).body.suggestions.map((s: { street: string }) => s.street);

    expect(await labels("Santa Clara St")).toEqual([]);
    expect(await labels("4343 Stevens Creek Boulevard")).toEqual(["4343 Stevens Creek Blvd"]);
    expect(await labels("4343 stev")).toEqual(["4343 Stevens Creek Blvd"]);
  });

  it("is only for signed-in shoppers", async () => {
    const res = await request(setup()).get("/api/orders/address-suggestions").query({ q: "1 Washington" });
    expect(res.status).toBe(401);
  });
});

describe("checking a delivery address", () => {
  it("gives an estimated delivery time for an address in range", async () => {
    const { agent } = await shopper(setup());
    const res = await agent.post("/api/orders/validate-address").send({ address });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ eligible: true, estimatedMinutes: expect.any(Number) });
  });

  it("asks for every address field and a real ZIP code", async () => {
    const { agent } = await shopper(setup());
    const missing = await agent.post("/api/orders/validate-address").send({ address: { ...address, city: " " } });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toMatch(/street, city, state, and ZIP/);
    const badZip = await agent.post("/api/orders/validate-address").send({ address: { ...address, zipCode: "951" } });
    expect(badZip.status).toBe(400);
    expect(badZip.body.error).toMatch(/valid ZIP/);
    expect((await agent.post("/api/orders/validate-address").send({})).status).toBe(400);
  });

  it("explains when the address can't be found or checked", async () => {
    const notFound = await shopper(setup({ geocodeDeliveryAddress: async () => null }));
    const res = await notFound.agent.post("/api/orders/validate-address").send({ address });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/couldn't locate/);

    const outage = await shopper(setup({ geocodeDeliveryAddress: async () => { throw new Error("down"); } }));
    const down = await outage.agent.post("/api/orders/validate-address").send({ address });
    expect(down.status).toBe(503);
    expect(down.body.error).toMatch(/try again/);
  });

  it("requires a logged-in customer", async () => {
    expect((await request(setup()).post("/api/orders/validate-address").send({ address })).status).toBe(401);
  });
});

describe("paying at checkout", () => {
  it("passes along the saved-card session", async () => {
    const { agent } = await shopper(setup());
    await agent.post("/api/cart/items").send({ productId: APPLES, quantity: 1 });
    const res = await agent.post("/api/orders/payment-intent");
    expect(res.body).toEqual({ clientSecret: "secret", customerSessionClientSecret: "session" });
  });

  it("says so when card payments aren't set up", async () => {
    const { agent } = await shopper(setup({ payments: undefined }));
    await agent.post("/api/cart/items").send({ productId: APPLES, quantity: 1 });

    const intent = await agent.post("/api/orders/payment-intent");
    expect(intent.status).toBe(500);
    expect(intent.body.error).toBe("Card payments are not configured.");

    const order = await agent.post("/api/orders").send({ address, paymentIntentId: "pi_1" });
    expect(order.status).toBe(500);
    expect(order.body.error).toBe("Card payments are not configured.");

    const failed = await agent.post("/api/orders/payment-failed").send({ paymentIntentId: "pi_1" });
    expect(failed.status).toBe(500);
  });

  it("turns unexpected payment errors into a server error", async () => {
    const payments: PaymentIntentCreator = {
      create: async () => { throw new Error("boom"); },
      retrieveSucceeded: async () => { throw new Error("boom"); },
      retrieveFailure: async () => { throw new Error("boom"); },
    };
    const { agent } = await shopper(setup({ payments }));
    await agent.post("/api/cart/items").send({ productId: APPLES, quantity: 1 });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect((await agent.post("/api/orders/payment-intent")).status).toBe(500);
    expect((await agent.post("/api/orders").send({ address, paymentIntentId: "pi_1" })).status).toBe(500);
    expect((await agent.post("/api/orders/payment-failed").send({ paymentIntentId: "pi_1" })).status).toBe(500);
    vi.restoreAllMocks();
  });

  it("refuses an order when the payment amount doesn't match the cart", async () => {
    let userId = "";
    const app = setup({
      payments: {
        create: async () => ({ clientSecret: "secret" }),
        retrieveSucceeded: async (id) => ({ id, amountCents: 100, userId }),
        retrieveFailure: async () => null,
      },
    });
    const customer = await shopper(app);
    userId = customer.userId;
    await customer.agent.post("/api/cart/items").send({ productId: APPLES, quantity: 1 });

    const res = await customer.agent.post("/api/orders").send({ address, paymentIntentId: "pi_1" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/cart total changed/);
    expect((await customer.agent.get("/api/cart")).body.items).toHaveLength(1);
  });

  it("saves the checked location with the order so dispatch doesn't look it up again", async () => {
    let userId = "";
    const cart = createMemoryCartStore([
      { productId: APPLES, name: "Gala Apples", category: "Fruits", unit: "lb", price: 1.49, unitCost: 0.8, weightLbs: 1, quantityInStock: 5, active: true },
    ]);
    const { orderStore } = createMemoryOrderStore(cart);
    const placeOrder = vi.spyOn(orderStore, "placeOrder");
    const app = setup({
      cartStore: cart.cartStore,
      orderStore,
      payments: {
        create: async () => ({ clientSecret: "secret" }),
        retrieveSucceeded: async (id) => ({ id, amountCents: 149, userId }),
        retrieveFailure: async () => null,
      },
    });
    const customer = await shopper(app);
    userId = customer.userId;
    await customer.agent.post("/api/cart/items").send({ productId: APPLES, quantity: 1 });

    expect((await customer.agent.post("/api/orders").send({ address, paymentIntentId: "pi_1" })).status).toBe(201);
    expect(placeOrder).toHaveBeenCalledWith(userId, expect.objectContaining(address), expect.anything(), { latitude: 37.3352, longitude: -121.8811 });
  });

  describe("when the card was charged but the order can't be saved", () => {
    async function paidShopper(overrides: Partial<AppOptions> = {}) {
      let userId = "";
      const refund = vi.fn(async () => {});
      const app = setup({
        payments: {
          create: async () => ({ clientSecret: "secret" }),
          retrieveSucceeded: async (id) => ({ id, amountCents: 149, userId }),
          retrieveFailure: async () => null,
          refund,
        },
        ...overrides,
      });
      const customer = await shopper(app);
      userId = customer.userId;
      await customer.agent.post("/api/cart/items").send({ productId: APPLES, quantity: 1 });
      return { ...customer, refund };
    }

    it("refunds the payment when the address can't be checked", async () => {
      const { agent, refund } = await paidShopper({ geocodeDeliveryAddress: async () => { throw new Error("down"); } });
      const res = await agent.post("/api/orders").send({ address, paymentIntentId: "pi_1" });
      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/payment was refunded/);
      expect(refund).toHaveBeenCalledWith("pi_1");
    });

    it("refunds the payment when saving the order fails", async () => {
      const cart = createMemoryCartStore([
        { productId: APPLES, name: "Gala Apples", category: "Fruits", unit: "lb", price: 1.49, unitCost: 0.8, weightLbs: 1, quantityInStock: 5, active: true },
      ]);
      const { orderStore } = createMemoryOrderStore(cart);
      orderStore.placeOrder = async () => { throw new Error("database down"); };
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { agent, refund } = await paidShopper({ cartStore: cart.cartStore, orderStore });
      const res = await agent.post("/api/orders").send({ address, paymentIntentId: "pi_2" });
      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/couldn't save your order\. Your payment was refunded/);
      expect(refund).toHaveBeenCalledWith("pi_2");
      vi.restoreAllMocks();
    });

    it("says to contact us when the refund itself fails", async () => {
      const { agent, refund } = await paidShopper({ geocodeDeliveryAddress: async () => null });
      refund.mockRejectedValueOnce(new Error("stripe down"));
      vi.spyOn(console, "error").mockImplementation(() => {});
      const res = await agent.post("/api/orders").send({ address, paymentIntentId: "pi_3" });
      expect(res.body.error).toMatch(/contact us for a refund/);
      vi.restoreAllMocks();
    });

    it("never refunds a payment that already paid for an order", async () => {
      const cart = createMemoryCartStore([
        { productId: APPLES, name: "Gala Apples", category: "Fruits", unit: "lb", price: 1.49, unitCost: 0.8, weightLbs: 1, quantityInStock: 5, active: true },
      ]);
      const { agent, refund } = await paidShopper({ cartStore: cart.cartStore, orderStore: createMemoryOrderStore(cart).orderStore });
      expect((await agent.post("/api/orders").send({ address, paymentIntentId: "pi_4" })).status).toBe(201);

      // Same total in the cart again, same payment sent again.
      await agent.post("/api/cart/items").send({ productId: APPLES, quantity: 1 });
      const again = await agent.post("/api/orders").send({ address, paymentIntentId: "pi_4" });
      expect(again.status).toBe(409);
      expect(again.body.error).toMatch(/already used/);
      expect(refund).not.toHaveBeenCalled();
    });
  });

  it("refuses an order paid by someone else or with a bad ZIP code", async () => {
    const app = setup({
      payments: {
        create: async () => ({ clientSecret: "secret" }),
        retrieveSucceeded: async (id) => ({ id, amountCents: 149, userId: "someone-else" }),
        retrieveFailure: async () => null,
      },
    });
    const { agent } = await shopper(app);
    await agent.post("/api/cart/items").send({ productId: APPLES, quantity: 1 });

    expect((await agent.post("/api/orders").send({ address, paymentIntentId: "pi_1" })).status).toBe(402);
    const badZip = await agent.post("/api/orders").send({ address: { ...address, zipCode: "abc" }, paymentIntentId: "pi_1" });
    expect(badZip.status).toBe(400);
    expect(badZip.body.error).toMatch(/valid ZIP/);
  });
});

describe("recording a declined card", () => {
  const decline = (userId: string): FailedPaymentAttempt => ({
    id: "pi_1", chargeId: "ch_1", amountCents: 149, userId, failureCode: "card_declined", declineCode: "insufficient_funds", message: "Your card has insufficient funds.",
  });

  it("saves the shopper's own declined payment for the manager", async () => {
    let userId = "";
    const recordFailedPayment = vi.fn(async () => {});
    const app = setup({
      payments: { create: async () => ({ clientSecret: "s" }), retrieveSucceeded: async () => null, retrieveFailure: async () => decline(userId) },
      reportsStore: { recordFailedPayment } as unknown as AppOptions["reportsStore"],
    });
    const customer = await shopper(app);
    userId = customer.userId;

    const res = await customer.agent.post("/api/orders/payment-failed").send({ paymentIntentId: "pi_1" });

    expect(res.status).toBe(204);
    expect(recordFailedPayment).toHaveBeenCalledWith({
      userId, paymentIntentId: "pi_1", chargeId: "ch_1", amountCents: 149,
      failureCode: "card_declined", declineCode: "insufficient_funds", message: "Your card has insufficient funds.",
    });
  });

  it("ignores missing, unknown or other shoppers' payments", async () => {
    const app = setup({
      payments: { create: async () => ({ clientSecret: "s" }), retrieveSucceeded: async () => null, retrieveFailure: async (id) => (id === "theirs" ? decline("someone-else") : null) },
    });
    const { agent } = await shopper(app);

    expect((await agent.post("/api/orders/payment-failed").send({})).status).toBe(400);
    expect((await agent.post("/api/orders/payment-failed").send({ paymentIntentId: "unknown" })).status).toBe(404);
    expect((await agent.post("/api/orders/payment-failed").send({ paymentIntentId: "theirs" })).status).toBe(404);
    expect((await request(app).post("/api/orders/payment-failed").send({ paymentIntentId: "x" })).status).toBe(401);
  });
});

describe("tracking and receiving an order", () => {
  it("shows tracking only for the shopper's own orders", async () => {
    const getCustomerTracking = vi.fn(async (_userId: string, orderId: string) => (orderId === "mine" ? { orderId } : null));
    const app = setup({ deliveryStore: { listDeliveries: async () => [], getCustomerTracking } as unknown as DeliveryStore });
    const { agent, userId } = await shopper(app);

    const found = await agent.get("/api/orders/mine/tracking");
    expect(found.status).toBe(200);
    expect(found.body.tracking).toEqual({ orderId: "mine" });
    expect(getCustomerTracking).toHaveBeenCalledWith(userId, "mine");
    expect((await agent.get("/api/orders/other/tracking")).status).toBe(404);
    expect((await request(app).get("/api/orders/mine/tracking")).status).toBe(401);
  });

  it("marks a delivered order as received", async () => {
    const results: Record<string, string> = { done: "updated", lost: "not-found", early: "not-delivered" };
    const confirmOrderReceived = vi.fn(async (_userId: string, orderId: string) => results[orderId]);
    const app = setup({ deliveryStore: { listDeliveries: async () => [], confirmOrderReceived } as unknown as DeliveryStore });
    const { agent } = await shopper(app);

    const done = await agent.post("/api/orders/done/received");
    expect(done.status).toBe(200);
    expect(done.body).toEqual({ orderId: "done", orderStatus: "completed" });
    expect((await agent.post("/api/orders/lost/received")).status).toBe(404);
    const early = await agent.post("/api/orders/early/received");
    expect(early.status).toBe(409);
    expect(early.body.error).toMatch(/not been delivered/);
    expect((await request(app).post("/api/orders/done/received")).status).toBe(401);
  });

  it("says so when tracking isn't available", async () => {
    const { agent } = await shopper(setup());
    expect((await agent.get("/api/orders/x/tracking")).status).toBe(501);
    expect((await agent.post("/api/orders/x/received")).status).toBe(501);
  });
});
