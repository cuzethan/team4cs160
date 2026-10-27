/**
 * Routing spike for mock delivery runs.
 *
 * Configure VALHALLA_URL to use a self-hosted Valhalla instance. If it is absent
 * or unavailable, the deterministic fallback orders stops by nearest neighbor
 * and estimates distance/time in a straight line. Fallback routes are explicitly
 * marked approximate so they are not confused with road routes.
 */

export type RoutePoint = {
  id: string;
  latitude: number;
  longitude: number;
};

export type RouteResult = {
  orderedStopIds: string[];
  distanceMeters: number;
  durationSeconds: number;
  /** GeoJSON coordinate pairs in [longitude, latitude] order. */
  geometry: [number, number][];
  /** Cumulative seconds from route start to each delivery, keyed by stop id. */
  arrivalOffsetsSeconds: Record<string, number>;
  source: "valhalla" | "approximate";
};

const EARTH_RADIUS_METERS = 6_371_000;
const FALLBACK_ROBOT_SPEED_METERS_PER_SECOND = 1.2;
const MAX_DELIVERY_STOPS = 10;
const REQUEST_TIMEOUT_MS = 5_000;

function validatePoint(point: RoutePoint) {
  if (!point.id || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {
    throw new Error("Each route point needs an id and valid latitude/longitude.");
  }
  if (point.latitude < -90 || point.latitude > 90 || point.longitude < -180 || point.longitude > 180) {
    throw new Error(`Route point ${point.id} has coordinates outside the valid range.`);
  }
}

function radians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function distanceBetween(a: RoutePoint, b: RoutePoint) {
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
}

function approximateRoute(start: RoutePoint, deliveries: RoutePoint[]): RouteResult {
  const remaining = [...deliveries];
  const ordered: RoutePoint[] = [];
  let current = start;
  let distanceMeters = 0;
  let elapsedSeconds = 0;
  const arrivalOffsetsSeconds: Record<string, number> = {};

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = distanceBetween(current, remaining[0]);
    for (let index = 1; index < remaining.length; index += 1) {
      const candidateDistance = distanceBetween(current, remaining[index]);
      if (candidateDistance < nearestDistance) {
        nearestDistance = candidateDistance;
        nearestIndex = index;
      }
    }

    const [next] = remaining.splice(nearestIndex, 1);
    distanceMeters += nearestDistance;
    elapsedSeconds += nearestDistance / FALLBACK_ROBOT_SPEED_METERS_PER_SECOND;
    ordered.push(next);
    arrivalOffsetsSeconds[next.id] = Math.round(elapsedSeconds);
    current = next;
  }

  const returnDistance = distanceBetween(current, start);
  distanceMeters += returnDistance;
  elapsedSeconds += returnDistance / FALLBACK_ROBOT_SPEED_METERS_PER_SECOND;

  return {
    orderedStopIds: ordered.map(({ id }) => id),
    distanceMeters: Math.round(distanceMeters),
    durationSeconds: Math.round(elapsedSeconds),
    geometry: [start, ...ordered, start].map(({ longitude, latitude }) => [longitude, latitude]),
    arrivalOffsetsSeconds,
    source: "approximate",
  };
}

// Valhalla returns encoded polyline shapes at precision 6.
function decodePolyline6(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  const readDelta = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) throw new Error("Valhalla returned an invalid route shape.");
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    latitude += readDelta();
    longitude += readDelta();
    points.push([longitude / 1_000_000, latitude / 1_000_000]);
  }
  return points;
}

type ValhallaTrip = {
  trip?: {
    locations?: { original_index?: number }[];
    legs?: { shape?: string; summary?: { length?: number; time?: number } }[];
    summary?: { length?: number; time?: number };
  };
  error?: string;
  status_message?: string;
};

async function requestValhalla(
  baseUrl: string,
  action: "route" | "optimized_route",
  locations: RoutePoint[],
): Promise<RouteResult> {
  const url = new URL(`/${action}`, baseUrl);
  const payload = {
    locations: locations.map(({ latitude, longitude }) => ({ lat: latitude, lon: longitude, type: "break" })),
    costing: "pedestrian",
    units: "kilometers",
    directions_type: "none",
  };
  url.searchParams.set("json", JSON.stringify(payload));

  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Valhalla returned HTTP ${response.status}.`);
  const data = (await response.json()) as ValhallaTrip;
  const trip = data.trip;
  if (!trip?.locations || !trip.legs || !trip.summary) {
    throw new Error(data.error ?? data.status_message ?? "Valhalla returned an incomplete route.");
  }

  // Valhalla keeps the endpoints fixed and reports original_index for reordered
  // intermediate waypoints, letting callers map its sequence back to order ids.
  const orderedInputIndexes = trip.locations.map((location, index) => location.original_index ?? index);
  const orderedPoints = orderedInputIndexes.map((inputIndex) => locations[inputIndex]);
  if (orderedPoints.some((point) => !point)) throw new Error("Valhalla returned an unknown stop index.");

  const geometry = trip.legs.flatMap((leg, index) => {
    const decoded = leg.shape ? decodePolyline6(leg.shape) : [];
    return index === 0 ? decoded : decoded.slice(1);
  });
  if (geometry.length === 0) {
    geometry.push(...orderedPoints.map(({ longitude, latitude }) => [longitude, latitude] as [number, number]));
  }

  let elapsedSeconds = 0;
  let distanceMeters = 0;
  const arrivalOffsetsSeconds: Record<string, number> = {};
  for (let legIndex = 0; legIndex < trip.legs.length; legIndex += 1) {
    const leg = trip.legs[legIndex];
    elapsedSeconds += leg.summary?.time ?? 0;
    distanceMeters += (leg.summary?.length ?? 0) * 1_000;
    const reachedPoint = orderedPoints[legIndex + 1];
    if (reachedPoint && reachedPoint.id !== locations[0].id && reachedPoint.id !== locations.at(-1)?.id) {
      arrivalOffsetsSeconds[reachedPoint.id] = Math.round(elapsedSeconds);
    }
  }

  return {
    orderedStopIds: orderedPoints.slice(1, -1).map(({ id }) => id),
    distanceMeters: Math.round((trip.summary.length ?? distanceMeters / 1_000) * 1_000),
    durationSeconds: Math.round(trip.summary.time ?? elapsedSeconds),
    geometry,
    arrivalOffsetsSeconds,
    source: "valhalla",
  };
}

/**
 * Route a delivery run as a depot round trip. `start` is also used as the end
 * depot so Valhalla can freely optimize every delivery stop between the fixed
 * endpoints. A run may contain at most ten orders.
 */
export async function calculateDeliveryRoute(
  start: RoutePoint,
  deliveries: RoutePoint[],
  valhallaUrl = process.env.VALHALLA_URL,
): Promise<RouteResult> {
  validatePoint(start);
  if (deliveries.length === 0) throw new Error("A delivery route needs at least one order.");
  if (deliveries.length > MAX_DELIVERY_STOPS) {
    throw new Error(`A delivery route can contain at most ${MAX_DELIVERY_STOPS} orders.`);
  }
  deliveries.forEach(validatePoint);
  if (new Set(deliveries.map(({ id }) => id)).size !== deliveries.length || deliveries.some(({ id }) => id === start.id)) {
    throw new Error("Route point ids must be unique.");
  }

  if (valhallaUrl) {
    try {
      const locations = [start, ...deliveries, start];
      // Valhalla's optimized route requires at least four locations; for a
      // single order, a regular route gives the required fixed visit order.
      return await requestValhalla(valhallaUrl, deliveries.length === 1 ? "route" : "optimized_route", locations);
    } catch {
      // Routing is optional for the mock simulator. Keep the run available and
      // expose the approximate source on the result for the UI to label.
    }
  }

  return approximateRoute(start, deliveries);
}
