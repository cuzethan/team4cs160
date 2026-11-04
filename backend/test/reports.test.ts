import bcrypt from "bcryptjs";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { FailedPaymentAttempt } from "../src/payments.js";
import {
  daysOfStockLeft,
  emptyReportsStore,
  failureReason,
  stockStatus,
  type FailedPaymentRecord,
  type ReportsStore,
} from "../src/reports.js";
import type { SalesRange } from "../src/store.js";
import { createMemoryCartStore, createMemoryOrderStore, createMemoryProductStore, createMemoryStore } from "./memoryStores.js";

const customer = {
  firstName: "Lee",
  lastName: "Nguyen",
  phone: "408-555-0100",
  email: "lee@ofs.com",
  password: "carrots123",
  securityQuestion: "What was the name of your last pet?",
  securityAnswer: "Fluffy",
};

function setup(failures: Map<string, FailedPaymentAttempt> = new Map()) {
  const memory = createMemoryStore();
  const cart = createMemoryCartStore([]);
  const recorded: FailedPaymentRecord[] = [];
  const inventoryReport = vi.fn((range: SalesRange) => emptyReportsStore.inventoryReport(range));
  const failedPaymentsReport = vi.fn((range: SalesRange) => emptyReportsStore.failedPaymentsReport(range));
  const reportsStore: ReportsStore = {
    inventoryReport,
    failedPaymentsReport,
    async recordFailedPayment(failure) { recorded.push(failure); },
  };
  const app = createApp({
    store: memory.store,
    cartStore: cart.cartStore,
    orderStore: createMemoryOrderStore(cart).orderStore,
    productStore: createMemoryProductStore(cart).productStore,
    salesStore: { listSales: async () => [], listSalesAnalytics: async () => ({ profitBuckets: [], items: [], categories: [] }) },
    reportsStore,
    deliveryStore: { listDeliveries: async () => [] },
    payments: {
      async create() { return { clientSecret: "secret" }; },
      async retrieveSucceeded() { return null; },
      async retrieveFailure(id) { return failures.get(id) ?? null; },
    },
    appUrl: "http://localhost:5173",
    secureCookies: false,
    checkDatabase: async () => {},
  });

  const loggedInCustomer = async () => {
    const agent = request.agent(app);
    const registered = await agent.post("/api/auth/register").send(customer);
    return { agent, userId: registered.body.user.id as string };
  };
  const loggedInManager = async () => {
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
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "manager@ofs.com", password: "manager123", role: "manager" });
    return agent;
  };

  return { app, recorded, inventoryReport, failedPaymentsReport, loggedInCustomer, loggedInManager };
}

describe("manager reports API", () => {
  it("only lets managers see reports", async () => {
    const { app, loggedInCustomer } = setup();
    expect((await request(app).get("/api/manager/reports/inventory")).status).toBe(401);
    expect((await request(app).get("/api/manager/reports/failed-payments")).status).toBe(401);

    const { agent } = await loggedInCustomer();
    expect((await agent.get("/api/manager/reports/inventory")).status).toBe(403);
    expect((await agent.get("/api/manager/reports/failed-payments")).status).toBe(403);
  });

  it("returns each report for the chosen range, defaulting to the last week", async () => {
    const { inventoryReport, failedPaymentsReport, loggedInManager } = setup();
    const manager = await loggedInManager();

    const inventory = await manager.get("/api/manager/reports/inventory");
    expect(inventory.status).toBe(200);
    expect(inventory.body.report.range).toBe("week");
    expect(inventoryReport).toHaveBeenCalledWith("week");

    const failed = await manager.get("/api/manager/reports/failed-payments?range=month");
    expect(failed.status).toBe(200);
    expect(failed.body.report.range).toBe("month");
    expect(failedPaymentsReport).toHaveBeenCalledWith("month");
  });

  it("rejects an unknown range", async () => {
    const { inventoryReport, loggedInManager } = setup();
    const manager = await loggedInManager();
    expect((await manager.get("/api/manager/reports/inventory?range=year")).status).toBe(400);
    expect((await manager.get("/api/manager/reports/failed-payments?range=")).status).toBe(400);
    expect(inventoryReport).not.toHaveBeenCalled();
  });
});

describe("recording declined payments", () => {
  const decline = (userId: string): FailedPaymentAttempt => ({
    id: "pi_declined",
    chargeId: "ch_1",
    amountCents: 1299,
    userId,
    failureCode: "card_declined",
    declineCode: "insufficient_funds",
    message: "Your card has insufficient funds.",
  });

  it("requires a logged-in customer and a payment id", async () => {
    const { app, loggedInCustomer } = setup();
    expect((await request(app).post("/api/orders/payment-failed").send({ paymentIntentId: "pi_declined" })).status).toBe(401);

    const { agent } = await loggedInCustomer();
    expect((await agent.post("/api/orders/payment-failed").send({})).status).toBe(400);
  });

  it("saves the decline Stripe reports for the customer's own payment", async () => {
    const failures = new Map<string, FailedPaymentAttempt>();
    const { recorded, loggedInCustomer } = setup(failures);
    const { agent, userId } = await loggedInCustomer();
    failures.set("pi_declined", decline(userId));

    const response = await agent.post("/api/orders/payment-failed").send({ paymentIntentId: "pi_declined" });
    expect(response.status).toBe(204);
    expect(recorded).toEqual([{
      userId,
      paymentIntentId: "pi_declined",
      chargeId: "ch_1",
      amountCents: 1299,
      failureCode: "card_declined",
      declineCode: "insufficient_funds",
      message: "Your card has insufficient funds.",
    }]);
  });

  it("ignores payments Stripe has no decline for, or that belong to someone else", async () => {
    const failures = new Map<string, FailedPaymentAttempt>([["pi_other", decline("someone-else")]]);
    const { recorded, loggedInCustomer } = setup(failures);
    const { agent } = await loggedInCustomer();

    expect((await agent.post("/api/orders/payment-failed").send({ paymentIntentId: "pi_missing" })).status).toBe(404);
    expect((await agent.post("/api/orders/payment-failed").send({ paymentIntentId: "pi_other" })).status).toBe(404);
    expect(recorded).toEqual([]);
  });
});

describe("report calculations", () => {
  const now = new Date("2026-11-04T12:00:00.000Z");
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  it("labels stock as out, low, slow, or fine", () => {
    expect(stockStatus(0, true, daysAgo(1), now)).toBe("out");
    expect(stockStatus(10, true, daysAgo(1), now)).toBe("low");
    expect(stockStatus(11, true, daysAgo(15), now)).toBe("slow");
    expect(stockStatus(11, true, null, now)).toBe("slow");
    expect(stockStatus(11, true, daysAgo(13), now)).toBe("ok");
    expect(stockStatus(11, false, null, now)).toBe("ok");
  });

  it("works out whole days of stock left at the range's selling rate", () => {
    expect(daysOfStockLeft(12, 42, 7)).toBe(2);
    expect(daysOfStockLeft(30, 7, 7)).toBe(30);
    expect(daysOfStockLeft(30, 0, 7)).toBeNull();
    expect(daysOfStockLeft(30, 5, 0)).toBeNull();
  });

  it("turns Stripe codes into plain reasons", () => {
    expect(failureReason("insufficient_funds", "card_declined")).toBe("Insufficient funds");
    expect(failureReason(null, "expired_card")).toBe("Expired card");
    expect(failureReason("generic_decline", "card_declined")).toBe("Card declined");
    expect(failureReason(null, null)).toBe("Card declined");
    expect(failureReason("do_not_honor", null)).toBe("Do not honor");
  });
});
