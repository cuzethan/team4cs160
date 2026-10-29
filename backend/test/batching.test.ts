import { describe, expect, it, vi } from "vitest";
import { dispatchPendingOrders } from "../src/batching.js";
import type { RoutePoint } from "../src/routeService.js";
import type { DeliveryStore, NewDeliveryRun, UnassignedPaidOrder } from "../src/store.js";

const BASE = { latitude: 37.3382, longitude: -121.8863 };

function order(orderId: string, coordinates: { latitude: number | null; longitude: number | null }): UnassignedPaidOrder {
  return {
    orderId,
    customerId: `customer-${orderId}`,
    addressId: `address-${orderId}`,
    totalWeight: 1,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    street: "1 Main St",
    city: "San Jose",
    state: "CA",
    zipCode: "95112",
    ...coordinates,
  };
}

describe("delivery distance limit", () => {
  it("only routes destinations within the configured radius of the robot base", async () => {
    const orders = [
      order("nearby", { latitude: 37.35, longitude: -121.88 }),
      order("brazil-cached", { latitude: -23.5505, longitude: -46.6333 }),
      order("brazil-geocoded", { latitude: null, longitude: null }),
    ];
    const createDeliveryRun = vi.fn(async (_run: NewDeliveryRun) => "run-1");
    const saveAddressCoordinates = vi.fn(async () => true);
    const deliveryStore: DeliveryStore = {
      async listDeliveries() { return []; },
      async listUnassignedPaidOrders() { return orders; },
      async listRobots() {
        return [{
          robotId: "robot-1",
          robotName: "Demo Robot",
          status: "available",
          maximumOrders: 10,
          maximumWeight: 200,
          currentLatitude: BASE.latitude,
          currentLongitude: BASE.longitude,
          lastUpdated: new Date(),
        }];
      },
      createDeliveryRun,
      saveAddressCoordinates,
    };
    const route = vi.fn(async (_start: RoutePoint, points: RoutePoint[]) => ({
      orderedStopIds: points.map(({ id }) => id),
      distanceMeters: 1_000,
      durationSeconds: 100,
      geometry: [[BASE.longitude, BASE.latitude], [points[0].longitude, points[0].latitude]] as [number, number][],
      arrivalOffsetsSeconds: { nearby: 100 },
      source: "approximate" as const,
    }));

    const result = await dispatchPendingOrders(deliveryStore, {
      baseLocation: BASE,
      maxDeliveryDistanceMiles: 50,
      geocode: async () => ({ latitude: -23.5505, longitude: -46.6333 }),
      route,
    });

    expect(result.runs[0].orderIds).toEqual(["nearby"]);
    expect(result.distanceLimitOrderIds).toEqual(["brazil-cached", "brazil-geocoded"]);
    expect(result.pendingOrderIds).toEqual([]);
    expect(route).toHaveBeenCalledOnce();
    expect(createDeliveryRun).toHaveBeenCalledOnce();
    expect(saveAddressCoordinates).toHaveBeenCalledOnce();
  });
});
