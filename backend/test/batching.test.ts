import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchPendingOrders } from "../src/batching.js";
import type { RouteResult, RoutePoint } from "../src/routeService.js";
import type { DeliveryRobot, DeliveryStore, UnassignedPaidOrder } from "../src/store.js";

const BASE = { latitude: 37.3382, longitude: -121.8863 };

function order(id: string, overrides: Partial<UnassignedPaidOrder> = {}): UnassignedPaidOrder {
  return {
    orderId: id,
    customerId: "customer-1",
    addressId: `address-${id}`,
    totalWeight: 10,
    createdAt: new Date("2026-11-01T10:00:00Z"),
    street: "1 Washington Sq",
    city: "San Jose",
    state: "CA",
    zipCode: "95192",
    latitude: 37.3352,
    longitude: -121.8811,
    ...overrides,
  };
}

function robot(id: string, overrides: Partial<DeliveryRobot> = {}): DeliveryRobot {
  return {
    robotId: id,
    robotName: `Robot ${id}`,
    status: "available",
    maximumOrders: 10,
    maximumWeight: 200,
    currentLatitude: BASE.latitude,
    currentLongitude: BASE.longitude,
    lastUpdated: new Date(),
    ...overrides,
  };
}

// Visits stops in the order given, one minute apart.
async function straightRoute(_start: RoutePoint, points: RoutePoint[]): Promise<RouteResult> {
  return {
    orderedStopIds: points.map(({ id }) => id),
    distanceMeters: 1000 * points.length,
    durationSeconds: 60 * (points.length + 1),
    geometry: [],
    arrivalOffsetsSeconds: Object.fromEntries(points.map(({ id }, index) => [id, 60 * (index + 1)])),
    source: "approximate",
  };
}

function storeWith(orders: UnassignedPaidOrder[], robots: DeliveryRobot[], overrides: Partial<DeliveryStore> = {}) {
  let next = 0;
  const createDeliveryRun = vi.fn(async () => `run-${++next}`);
  const saveAddressCoordinates = vi.fn(async () => true);
  const store: DeliveryStore = {
    listDeliveries: async () => [],
    listUnassignedPaidOrders: async () => orders,
    listRobots: async () => robots,
    createDeliveryRun,
    saveAddressCoordinates,
    ...overrides,
  };
  return { store, createDeliveryRun, saveAddressCoordinates };
}

const dispatchOptions = { robotBase: BASE, route: straightRoute, now: () => new Date("2026-11-01T12:00:00Z") };

describe("delivery trip batching", () => {
  afterEach(() => vi.restoreAllMocks());

  it("never puts more than 10 orders in one run", async () => {
    const orders = Array.from({ length: 12 }, (_, index) => order(`o${index + 1}`, { totalWeight: 1 }));
    const { store } = storeWith(orders, [robot("r1"), robot("r2")]);

    const result = await dispatchPendingOrders(store, dispatchOptions);

    expect(result.runs.map((run) => run.orderIds.length)).toEqual([10, 2]);
    expect(result.pendingOrderIds).toEqual([]);
  });

  it("never puts more than 200 lb in one run and keeps the rest for later", async () => {
    const orders = [order("a", { totalWeight: 120 }), order("b", { totalWeight: 90 }), order("c", { totalWeight: 70 })];
    const { store } = storeWith(orders, [robot("r1")]);

    const result = await dispatchPendingOrders(store, dispatchOptions);

    expect(result.runs).toHaveLength(1);
    expect(result.runs[0].orderIds).toEqual(["a", "c"]);
    expect(result.pendingOrderIds).toEqual(["b"]);
  });

  it("uses the smaller of the robot's own limits and the store limits", async () => {
    const orders = [order("a", { totalWeight: 30 }), order("b", { totalWeight: 30 }), order("c", { totalWeight: 30 })];
    const { store } = storeWith(orders, [robot("small", { maximumOrders: 2, maximumWeight: 50 })]);

    const result = await dispatchPendingOrders(store, dispatchOptions);

    expect(result.runs[0].orderIds).toEqual(["a"]);
    expect(result.pendingOrderIds).toEqual(["b", "c"]);
  });

  it("assigns every eligible order to exactly one run", async () => {
    const orders = Array.from({ length: 15 }, (_, index) => order(`o${index + 1}`, { totalWeight: 25 }));
    const { store } = storeWith(orders, [robot("r1"), robot("r2"), robot("r3")]);

    const result = await dispatchPendingOrders(store, dispatchOptions);
    const assigned = result.runs.flatMap((run) => run.orderIds);

    expect(new Set(assigned).size).toBe(assigned.length);
    expect(assigned.sort()).toEqual(orders.map((o) => o.orderId).sort());
    for (const run of result.runs) {
      expect(run.orderIds.length).toBeLessThanOrEqual(10);
      expect(run.orderIds.length * 25).toBeLessThanOrEqual(200);
    }
  });

  it("sends the robot a run with the route, stops and arrival times", async () => {
    const { store, createDeliveryRun } = storeWith([order("a"), order("b")], [robot("r1")]);

    const result = await dispatchPendingOrders(store, dispatchOptions);

    expect(result.runs).toEqual([{ runId: "run-1", robotId: "r1", orderIds: ["a", "b"], routeSource: "approximate" }]);
    expect(createDeliveryRun).toHaveBeenCalledWith({
      robotId: "r1",
      routeDistanceMeters: 2000,
      estimatedDurationSeconds: 180,
      routeGeometry: [],
      routeSource: "approximate",
      stops: [
        { orderId: "a", estimatedDeliveryTime: new Date("2026-11-01T12:01:00Z") },
        { orderId: "b", estimatedDeliveryTime: new Date("2026-11-01T12:02:00Z") },
      ],
    });
  });

  it("falls back to the full trip time when a stop has no arrival time", async () => {
    const { store, createDeliveryRun } = storeWith([order("a")], [robot("r1")]);
    const route = async (start: RoutePoint, points: RoutePoint[]) => ({ ...(await straightRoute(start, points)), arrivalOffsetsSeconds: {} });

    await dispatchPendingOrders(store, { ...dispatchOptions, route });

    expect(createDeliveryRun.mock.calls[0][0].stops).toEqual([
      { orderId: "a", estimatedDeliveryTime: new Date("2026-11-01T12:02:00Z") },
    ]);
  });

  it("skips orders heavier than a robot can carry", async () => {
    const { store } = storeWith([order("huge", { totalWeight: 250 }), order("a")], [robot("r1")]);

    const result = await dispatchPendingOrders(store, dispatchOptions);

    expect(result.overCapacityOrderIds).toEqual(["huge"]);
    expect(result.runs[0].orderIds).toEqual(["a"]);
  });

  it("skips orders outside the delivery radius", async () => {
    const farAway = order("far", { latitude: 38.9, longitude: -77.03 });
    const { store } = storeWith([farAway, order("a")], [robot("r1")]);

    const result = await dispatchPendingOrders(store, { ...dispatchOptions, deliveryRadiusMiles: 5 });

    expect(result.outOfRangeOrderIds).toEqual(["far"]);
    expect(result.runs[0].orderIds).toEqual(["a"]);
  });

  it("looks up and saves coordinates for addresses that have none", async () => {
    const { store, saveAddressCoordinates } = storeWith([order("new", { latitude: null, longitude: null })], [robot("r1")]);
    const geocode = vi.fn(async () => ({ latitude: 37.34, longitude: -121.89 }));

    const result = await dispatchPendingOrders(store, { ...dispatchOptions, geocode });

    expect(saveAddressCoordinates).toHaveBeenCalledWith("address-new", 37.34, -121.89);
    expect(result.runs[0].orderIds).toEqual(["new"]);
  });

  it("keeps orders queued when their address can't be found or saved", async () => {
    const orders = [
      order("unknown", { latitude: null, longitude: null }),
      order("unsaved", { latitude: null, longitude: null }),
      order("outage", { latitude: null, longitude: null }),
    ];
    const geocode = vi.fn(async (address: { street: string }) => {
      if (address.street === "outage") throw new Error("geocoder down");
      return address.street === "unknown" ? null : { latitude: 37.34, longitude: -121.89 };
    });
    for (const o of orders) o.street = o.orderId;
    const { store } = storeWith(orders, [robot("r1")], { saveAddressCoordinates: async () => false });

    const result = await dispatchPendingOrders(store, { ...dispatchOptions, geocode });

    expect(result.unresolvedAddressOrderIds).toEqual(["unknown", "unsaved", "outage"]);
    expect(result.runs).toEqual([]);
  });

  it("skips a looked-up address that turns out to be out of range", async () => {
    const { store } = storeWith([order("far", { latitude: null, longitude: null })], [robot("r1")]);
    const geocode = async () => ({ latitude: 38.9, longitude: -77.03 });

    const result = await dispatchPendingOrders(store, { ...dispatchOptions, geocode, deliveryRadiusMiles: 5 });

    expect(result.outOfRangeOrderIds).toEqual(["far"]);
  });

  it("only uses robots that are available, located and able to carry something", async () => {
    const robots = [
      robot("busy", { status: "delivering" }),
      robot("lost", { currentLatitude: null }),
      robot("broken", { maximumOrders: 0 }),
      robot("ok"),
    ];
    const { store } = storeWith([order("a")], robots);

    const result = await dispatchPendingOrders(store, dispatchOptions);

    expect(result.unavailableRobotIds).toEqual(["lost", "broken"]);
    expect(result.runs.map((run) => run.robotId)).toEqual(["ok"]);
  });

  it("leaves robots idle when there is nothing they can carry", async () => {
    const { store, createDeliveryRun } = storeWith([], [robot("r1")]);

    const result = await dispatchPendingOrders(store, dispatchOptions);

    expect(createDeliveryRun).not.toHaveBeenCalled();
    expect(result.runs).toEqual([]);
  });

  it("keeps orders pending when the run can't be saved", async () => {
    const { store } = storeWith([order("a")], [robot("r1")], { createDeliveryRun: async () => { throw new Error("conflict"); } });

    const result = await dispatchPendingOrders(store, dispatchOptions);

    expect(result.unavailableRobotIds).toEqual(["r1"]);
    expect(result.pendingOrderIds).toEqual(["a"]);
  });

  it("rejects a route that drops or invents stops", async () => {
    const { store } = storeWith([order("a"), order("b")], [robot("r1")]);
    const route = async (start: RoutePoint, points: RoutePoint[]) => ({ ...(await straightRoute(start, points)), orderedStopIds: ["a", "x"] });

    await expect(dispatchPendingOrders(store, { ...dispatchOptions, route })).rejects.toThrow("incomplete order sequence");
  });

  it("needs a store that supports batching", async () => {
    await expect(dispatchPendingOrders({ listDeliveries: async () => [] })).rejects.toThrow("not available");
  });

  it("uses the default radius, base, route and clock when none are given", async () => {
    vi.stubEnv("VALHALLA_URL", "");
    const { store, createDeliveryRun } = storeWith([order("a")], [robot("r1")]);

    const result = await dispatchPendingOrders(store);
    vi.unstubAllEnvs();

    expect(result.runs[0].routeSource).toBe("approximate");
    expect(createDeliveryRun.mock.calls[0][0].stops[0].estimatedDeliveryTime).toBeInstanceOf(Date);
  });
});
