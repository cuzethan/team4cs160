import bcrypt from "bcryptjs";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp, type AppOptions } from "../src/app.js";
import type { DeliveryStore, SettingsStore } from "../src/store.js";
import { createMemoryCartStore, createMemoryOrderStore, createMemoryProductStore, createMemoryStore } from "./memoryStores.js";

const ROBOT = "00000000-0000-4000-8000-000000000010";

async function setup(deliveryStore: Partial<DeliveryStore> = {}, extra: Partial<AppOptions> = {}) {
  const memory = createMemoryStore();
  const cart = createMemoryCartStore([]);
  const app = createApp({
    store: memory.store,
    cartStore: cart.cartStore,
    orderStore: createMemoryOrderStore(cart).orderStore,
    productStore: createMemoryProductStore(cart).productStore,
    salesStore: { listSales: async () => [], listSalesAnalytics: async () => ({ profitBuckets: [], items: [], categories: [], deliveryFees: { collected: 0, ordersWithFee: 0 } }) },
    deliveryStore: { listDeliveries: async () => [], ...deliveryStore },
    appUrl: "http://localhost:5173",
    secureCookies: false,
    checkDatabase: async () => {},
    ...extra,
  });
  await memory.store.createUser({
    firstName: "Max", lastName: "Boss", phone: "408-555-0110", email: "manager@ofs.com",
    passwordHash: await bcrypt.hash("manager123", 4), role: "admin",
    questionChoice: "What was the name of your last pet?", answerHash: "unused",
  });
  const manager = request.agent(app);
  await manager.post("/api/auth/login").send({ email: "manager@ofs.com", password: "manager123", role: "manager" });
  const customer = request.agent(app);
  await customer.post("/api/auth/register").send({
    firstName: "Lee", lastName: "Nguyen", phone: "(408) 555-0100", email: "lee@ofs.com", password: "carrots123",
    securityQuestion: "What was the name of your last pet?", securityAnswer: "Fluffy",
  });
  return { app, manager, customer };
}

// Every manager delivery endpoint, with the store method it needs.
const endpoints = [
  { method: "get", path: "/api/manager/deliveries/robots", needs: "listRobots" },
  { method: "post", path: "/api/manager/deliveries/robots", needs: "createRobot" },
  { method: "post", path: `/api/manager/deliveries/robots/${ROBOT}/retire`, needs: "retireRobot" },
  { method: "post", path: `/api/manager/deliveries/robots/${ROBOT}/restore`, needs: "restoreRobot" },
  { method: "delete", path: `/api/manager/deliveries/robots/${ROBOT}`, needs: "deleteRobot" },
  { method: "get", path: "/api/manager/deliveries/runs", needs: "listRuns" },
  { method: "post", path: "/api/manager/deliveries/runs/run-1/cancel", needs: "cancelDeliveryRun" },
  { method: "post", path: `/api/manager/deliveries/robots/${ROBOT}/recall`, needs: "recallRobot" },
  { method: "post", path: "/api/manager/deliveries/order-1/refund", needs: "refundOrder" },
] as const;

describe("manager robot and delivery controls", () => {
  it("are only open to managers", async () => {
    const { app, customer } = await setup();
    for (const { method, path } of [...endpoints, { method: "get", path: "/api/manager/deliveries" }, { method: "post", path: "/api/manager/deliveries/dispatch" }] as const) {
      expect((await request(app)[method](path)).status, `${method} ${path}`).toBe(401);
      expect((await customer[method](path)).status, `${method} ${path}`).toBe(403);
    }
  });

  it("say so when the data isn't available", async () => {
    const { manager } = await setup();
    for (const { method, path } of endpoints) {
      expect((await manager[method](path)).status, `${method} ${path}`).toBe(501);
    }
  });

  it("list robots and runs", async () => {
    const { manager } = await setup({ listRobots: async () => [], listRuns: async () => [] });
    expect((await manager.get("/api/manager/deliveries/robots")).body).toEqual({ robots: [] });
    expect((await manager.get("/api/manager/deliveries/runs")).body).toEqual({ runs: [] });
  });

  it("check a new robot's id and name", async () => {
    const createRobot = vi.fn(async () => ({ robotId: ROBOT }));
    const { manager } = await setup({ createRobot } as Partial<DeliveryStore>);

    const badId = await manager.post("/api/manager/deliveries/robots").send({ robotId: "not-a-uuid" });
    expect(badId.status).toBe(400);
    const longName = await manager.post("/api/manager/deliveries/robots").send({ robotName: "x".repeat(101) });
    expect(longName.status).toBe(400);
    const blank = await manager.post("/api/manager/deliveries/robots").send({ robotName: "  " });
    expect(blank.status).toBe(400);

    const ok = await manager.post("/api/manager/deliveries/robots").send({ robotId: ROBOT, robotName: " Zoom " });
    expect(ok.status).toBe(201);
    expect(createRobot).toHaveBeenCalledWith({ robotId: ROBOT, robotName: "Zoom" });
  });

  it("explain a duplicate robot id", async () => {
    const duplicate = Object.assign(new Error("duplicate"), { code: "23505" });
    const { manager } = await setup({ createRobot: async () => { throw duplicate; } });
    const res = await manager.post("/api/manager/deliveries/robots").send({ robotId: ROBOT });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/ID already exists/);

    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await manager.post("/api/manager/deliveries/robots").send({})).status).toBe(500);
    vi.restoreAllMocks();
  });

  it.each([
    ["retire", "post", `/api/manager/deliveries/robots/${ROBOT}/retire`, "retireRobot", { robotId: ROBOT, status: "disabled" }],
    ["restore", "post", `/api/manager/deliveries/robots/${ROBOT}/restore`, "restoreRobot", { robotId: ROBOT, status: "available" }],
    ["delete", "delete", `/api/manager/deliveries/robots/${ROBOT}`, "deleteRobot", { robotId: ROBOT, status: "deleted" }],
  ] as const)("%s a robot, or explain why not", async (_label, method, path, needs, success) => {
    const results = ["updated", "not-found", "invalid-state"];
    const { manager } = await setup({ [needs]: async () => (needs === "deleteRobot" && results[0] === "updated" ? "deleted" : results[0]) });
    const ok = await manager[method](path);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual(success);

    results.shift();
    expect((await manager[method](path)).status).toBe(404);
    results.shift();
    expect((await manager[method](path)).status).toBe(409);
  });

  it("stop a delivery run, or explain why not", async () => {
    const results = ["cancelled", "not-found", "not-active"];
    const { manager } = await setup({ cancelDeliveryRun: async () => results.shift() as "cancelled" });
    const path = "/api/manager/deliveries/runs/run-1/cancel";
    expect((await manager.post(path)).body).toEqual({ runId: "run-1", status: "cancelled" });
    expect((await manager.post(path)).status).toBe(404);
    expect((await manager.post(path)).status).toBe(409);
  });

  it("send a robot home, or explain why not", async () => {
    const results = [
      { status: "returning", returnRunId: "ret-1", cancelledRunId: "run-1" },
      { status: "not-found" },
      { status: "already-at-base" },
    ];
    const { manager } = await setup({ recallRobot: async () => results.shift() } as unknown as Partial<DeliveryStore>);
    const path = `/api/manager/deliveries/robots/${ROBOT}/recall`;
    expect((await manager.post(path)).body).toEqual({ robotId: ROBOT, status: "returning", returnRunId: "ret-1", cancelledRunId: "run-1" });
    expect((await manager.post(path)).status).toBe(404);
    const home = await manager.post(path);
    expect(home.status).toBe(409);
    expect(home.body.error).toMatch(/already at the configured home base/);
  });

  it("refund an order, or explain why not", async () => {
    const results = ["refunded", "not-found", "already-refunded", "already-completed", "already-dispatched"];
    const { manager } = await setup({ refundOrder: async () => results.shift() } as unknown as Partial<DeliveryStore>);
    const path = "/api/manager/deliveries/order-1/refund";
    expect((await manager.post(path)).body).toEqual({ orderId: "order-1", paymentStatus: "refunded", orderStatus: "cancelled" });
    expect((await manager.post(path)).status).toBe(404);
    expect((await manager.post(path)).body.error).toMatch(/already refunded/);
    expect((await manager.post(path)).body.error).toMatch(/Completed orders/);
    expect((await manager.post(path)).body.error).toMatch(/Cancel the delivery run first/);
  });

  it("dispatch waiting orders using the saved radius and base", async () => {
    vi.stubEnv("VALHALLA_URL", "");
    const settingsStore: SettingsStore = {
      get: async () => ({ deliveryFee: 10, freeDeliveryWeightThreshold: 20, deliveryRadiusMiles: 5 }),
      update: async (value) => value,
      getRobotBase: async () => ({ latitude: 37.3382, longitude: -121.8863 }),
      updateRobotBase: async (value) => value,
    };
    const { manager } = await setup({
      listUnassignedPaidOrders: async () => [{
        orderId: "far", customerId: "c", addressId: "a", totalWeight: 5, createdAt: new Date(),
        street: "", city: "", state: "", zipCode: "", latitude: 38.9, longitude: -77.03,
      }],
      listRobots: async () => [],
      createDeliveryRun: async () => "run-1",
      saveAddressCoordinates: async () => true,
    }, { settingsStore });

    const res = await manager.post("/api/manager/deliveries/dispatch");
    expect(res.status).toBe(200);
    expect(res.body.outOfRangeOrderIds).toEqual(["far"]);
    vi.unstubAllEnvs();
  });
});

describe("delivery notifications", () => {
  it("list a shopper's notifications and mark them read", async () => {
    const markNotificationRead = vi.fn(async (_userId: string, id: string) => id === "n1");
    const { app, customer } = await setup({ listNotifications: async () => [], markNotificationRead } as unknown as Partial<DeliveryStore>);

    expect((await customer.get("/api/notifications")).body).toEqual({ notifications: [] });
    expect((await customer.patch("/api/notifications/n1/read")).body).toEqual({ notificationId: "n1", isRead: true });
    expect((await customer.patch("/api/notifications/n2/read")).status).toBe(404);
    expect((await request(app).get("/api/notifications")).status).toBe(401);
    expect((await request(app).patch("/api/notifications/n1/read")).status).toBe(401);
  });

  it("say so when notifications aren't available", async () => {
    const { customer } = await setup();
    expect((await customer.get("/api/notifications")).status).toBe(501);
    expect((await customer.patch("/api/notifications/n1/read")).status).toBe(501);
  });
});

describe("store location setting", () => {
  it("lets a manager move the robot base", async () => {
    const { app, manager, customer } = await setup();
    expect((await request(app).get("/api/settings/robot-base")).body).toEqual({ latitude: 37.3382, longitude: -121.8863 });

    const moved = await manager.put("/api/settings/robot-base").send({ latitude: 37.4, longitude: -121.9 });
    expect(moved.body).toEqual({ latitude: 37.4, longitude: -121.9 });
    expect(process.env.ROBOT_BASE_LATITUDE).toBe("37.4");
    delete process.env.ROBOT_BASE_LATITUDE;
    delete process.env.ROBOT_BASE_LONGITUDE;

    expect((await manager.put("/api/settings/robot-base").send({ latitude: 91, longitude: 0 })).status).toBe(400);
    expect((await manager.put("/api/settings/robot-base").send({ latitude: 0, longitude: "x" })).status).toBe(400);
    expect((await customer.put("/api/settings/robot-base").send({ latitude: 0, longitude: 0 })).status).toBe(403);
    expect((await request(app).put("/api/settings/robot-base").send({ latitude: 0, longitude: 0 })).status).toBe(401);
  });

  it("checks the delivery radius", async () => {
    const { manager } = await setup();
    const res = await manager.put("/api/settings").send({ deliveryFee: 10, freeDeliveryWeightThreshold: 20, deliveryRadiusMiles: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Delivery radius/);
  });
});
