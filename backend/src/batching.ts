import { calculateDeliveryRoute, type RoutePoint } from "./routeService.js";
import { geocodeAddress, type GeocodedLocation } from "./geocoder.js";
import type { DeliveryStore, DeliveryRobot, UnassignedPaidOrder } from "./store.js";

const MAX_ORDERS_PER_RUN = 10;
const MAX_WEIGHT_PER_RUN_LBS = 200;

export type DispatchResult = {
  runs: { runId: string; robotId: string; orderIds: string[]; routeSource: "valhalla" | "approximate" }[];
  pendingOrderIds: string[];
  unresolvedAddressOrderIds: string[];
  overCapacityOrderIds: string[];
  unavailableRobotIds: string[];
};

function hasCoordinates(order: UnassignedPaidOrder): order is UnassignedPaidOrder & GeocodedLocation {
  return order.latitude !== null && order.longitude !== null;
}

function runCapacity(robot: DeliveryRobot) {
  return {
    orders: Math.min(robot.maximumOrders, MAX_ORDERS_PER_RUN),
    weight: Math.min(robot.maximumWeight, MAX_WEIGHT_PER_RUN_LBS),
  };
}

/**
 * Batch FIFO paid orders, geocode addresses that have not been resolved yet,
 * calculate routes, and atomically reserve a robot and persist each run.
 */
export async function dispatchPendingOrders(
  deliveryStore: DeliveryStore,
  options: {
    photonUrl?: string;
    geocode?: typeof geocodeAddress;
    route?: typeof calculateDeliveryRoute;
    now?: () => Date;
  } = {},
): Promise<DispatchResult> {
  if (!deliveryStore.listUnassignedPaidOrders || !deliveryStore.listRobots ||
      !deliveryStore.createDeliveryRun || !deliveryStore.saveAddressCoordinates) {
    throw new Error("Delivery batching storage is not available.");
  }

  const [orders, robots] = await Promise.all([
    deliveryStore.listUnassignedPaidOrders(),
    deliveryStore.listRobots(),
  ]);
  const availableRobots = robots.filter((robot) => robot.status === "available");
  const unresolvedAddressOrderIds: string[] = [];
  const overCapacityOrderIds: string[] = [];
  const unavailableRobotIds: string[] = [];
  const routable: (UnassignedPaidOrder & GeocodedLocation)[] = [];

  for (const order of orders) {
    if (order.totalWeight > MAX_WEIGHT_PER_RUN_LBS) {
      overCapacityOrderIds.push(order.orderId);
      continue;
    }
    if (hasCoordinates(order)) {
      routable.push(order);
      continue;
    }

    try {
      const location = await (options.geocode ?? geocodeAddress)(order, options.photonUrl);
      if (!location) {
        unresolvedAddressOrderIds.push(order.orderId);
        continue;
      }
      const saved = await deliveryStore.saveAddressCoordinates(order.addressId, location.latitude, location.longitude);
      if (!saved) {
        unresolvedAddressOrderIds.push(order.orderId);
        continue;
      }
      routable.push({ ...order, ...location });
    } catch {
      // A geocoder outage leaves the paid order queued for another dispatch attempt.
      unresolvedAddressOrderIds.push(order.orderId);
    }
  }

  const pending = [...routable];
  const runs: DispatchResult["runs"] = [];
  const route = options.route ?? calculateDeliveryRoute;
  const now = options.now ?? (() => new Date());

  for (const robot of availableRobots) {
    if (robot.currentLatitude === null || robot.currentLongitude === null) {
      unavailableRobotIds.push(robot.robotId);
      continue;
    }
    const capacity = runCapacity(robot);
    if (capacity.orders < 1 || capacity.weight <= 0) {
      unavailableRobotIds.push(robot.robotId);
      continue;
    }

    const batch: typeof pending = [];
    let weight = 0;
    for (const order of pending) {
      if (batch.length >= capacity.orders) break;
      if (weight + order.totalWeight > capacity.weight) continue;
      batch.push(order);
      weight += order.totalWeight;
    }
    if (batch.length === 0) continue;

    const start: RoutePoint = {
      id: `robot:${robot.robotId}`,
      latitude: robot.currentLatitude,
      longitude: robot.currentLongitude,
    };
    const points = batch.map((order): RoutePoint => ({
      id: order.orderId,
      latitude: order.latitude,
      longitude: order.longitude,
    }));

    const routeResult = await route(start, points);
    const byId = new Map(batch.map((order) => [order.orderId, order]));
    const dispatchedAt = now();
    const stops = routeResult.orderedStopIds.map((orderId) => {
      const offset = routeResult.arrivalOffsetsSeconds[orderId] ?? routeResult.durationSeconds;
      return { orderId, estimatedDeliveryTime: new Date(dispatchedAt.getTime() + offset * 1_000) };
    });
    if (stops.length !== batch.length || stops.some(({ orderId }) => !byId.has(orderId))) {
      throw new Error("The route service returned an incomplete order sequence.");
    }

    try {
      const runId = await deliveryStore.createDeliveryRun({
        robotId: robot.robotId,
        routeDistanceMeters: routeResult.distanceMeters,
        estimatedDurationSeconds: routeResult.durationSeconds,
        routeGeometry: routeResult.geometry,
        routeSource: routeResult.source,
        stops,
      });
      runs.push({ runId, robotId: robot.robotId, orderIds: stops.map(({ orderId }) => orderId), routeSource: routeResult.source });
      const batchedIds = new Set(batch.map(({ orderId }) => orderId));
      for (let index = pending.length - 1; index >= 0; index -= 1) {
        if (batchedIds.has(pending[index].orderId)) pending.splice(index, 1);
      }
    } catch {
      unavailableRobotIds.push(robot.robotId);
      // Orders remain pending; a later dispatch can retry after the conflict clears.
    }
  }

  return {
    runs,
    pendingOrderIds: pending.map(({ orderId }) => orderId),
    unresolvedAddressOrderIds,
    overCapacityOrderIds,
    unavailableRobotIds,
  };
}
