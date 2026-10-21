import type { DeliveryStore, SimulatableDeliveryRun } from "./store.js";

const EARTH_RADIUS_METERS = 6_371_000;

function radians(degrees: number) {
  return degrees * Math.PI / 180;
}

function segmentLength(a: [number, number], b: [number, number]) {
  const latitudeDelta = radians(b[1] - a[1]);
  const longitudeDelta = radians(b[0] - a[0]);
  const value = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(a[1])) * Math.cos(radians(b[1])) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(value));
}

function pointAlongRoute(geometry: [number, number][], fraction: number): [number, number] | null {
  if (geometry.length === 0) return null;
  if (geometry.length === 1 || fraction <= 0) return geometry[0];
  if (fraction >= 1) return geometry[geometry.length - 1];

  const lengths = geometry.slice(1).map((point, index) => segmentLength(geometry[index], point));
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  if (totalLength <= 0) return geometry[geometry.length - 1];

  let target = totalLength * fraction;
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index];
    if (target <= length) {
      const ratio = length === 0 ? 0 : target / length;
      return [
        geometry[index][0] + (geometry[index + 1][0] - geometry[index][0]) * ratio,
        geometry[index][1] + (geometry[index + 1][1] - geometry[index][1]) * ratio,
      ];
    }
    target -= length;
  }
  return geometry[geometry.length - 1];
}

function tickForRun(run: SimulatableDeliveryRun, now: Date, speedMultiplier: number) {
  const duration = Math.max(1, run.estimatedDurationSeconds);
  const elapsedSeconds = Math.max(0, (now.getTime() - run.createdAt.getTime()) / 1_000) * speedMultiplier;
  const fraction = Math.min(1, elapsedSeconds / duration);
  const position = pointAlongRoute(run.routeGeometry, fraction);
  if (!position) return null;

  const arrivedStopNumbers = run.stops
    .filter((stop) => stop.status !== "delivered" && (stop.eta.getTime() - run.createdAt.getTime()) / 1_000 <= elapsedSeconds)
    .map(({ stopNumber }) => stopNumber);

  return {
    runId: run.runId,
    longitude: position[0],
    latitude: position[1],
    arrivedStopNumbers,
    completed: elapsedSeconds >= duration,
    occurredAt: now,
  };
}

/** Advance one stored route, persisting position, arrivals, and completion. */
export async function advanceDeliverySimulator(
  deliveryStore: DeliveryStore,
  options: { now?: Date; speedMultiplier?: number } = {},
) {
  if (!deliveryStore.listSimulatableRuns || !deliveryStore.recordSimulationTick) return 0;
  const now = options.now ?? new Date();
  const speedMultiplier = options.speedMultiplier ?? 60;
  const runs = await deliveryStore.listSimulatableRuns();
  let updated = 0;
  for (const run of runs) {
    const tick = tickForRun(run, now, speedMultiplier);
    if (!tick) continue;
    await deliveryStore.recordSimulationTick(tick);
    updated += 1;
  }
  return updated;
}

/** Start the background mock-robot loop. The timer is unreferenced so it does not
 * keep the backend alive during shutdown. */
export function startDeliverySimulator(
  deliveryStore: DeliveryStore,
  options: { intervalMs?: number; speedMultiplier?: number } = {},
) {
  const configuredInterval = options.intervalMs ?? Number(process.env.ROBOT_SIMULATOR_INTERVAL_MS ?? 1_000);
  const configuredSpeed = options.speedMultiplier ?? Number(process.env.ROBOT_SIMULATOR_SPEED_MULTIPLIER ?? 60);
  const intervalMs = Number.isFinite(configuredInterval) && configuredInterval > 0 ? Math.max(100, configuredInterval) : 1_000;
  const speedMultiplier = Number.isFinite(configuredSpeed) && configuredSpeed > 0 ? configuredSpeed : 60;
  let ticking = false;
  const timer = setInterval(() => {
    if (ticking) return;
    ticking = true;
    void advanceDeliverySimulator(deliveryStore, { speedMultiplier })
      .catch((error: unknown) => console.error("Robot simulator tick failed.", error))
      .finally(() => { ticking = false; });
  }, intervalMs);
  timer.unref?.();
  return timer;
}
