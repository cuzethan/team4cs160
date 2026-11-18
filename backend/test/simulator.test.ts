import { afterEach, describe, expect, it, vi } from "vitest";
import { advanceDeliverySimulator, startDeliverySimulator } from "../src/robotSimulator.js";
import type { DeliveryStore, SimulatableDeliveryRun } from "../src/store.js";

const start = new Date("2026-11-01T12:00:00Z");

function run(overrides: Partial<SimulatableDeliveryRun> = {}): SimulatableDeliveryRun {
  return {
    runId: "run-1",
    createdAt: start,
    estimatedDurationSeconds: 600,
    routeGeometry: [[-121.8863, 37.3382], [-121.8863, 37.3482]],
    stops: [
      { stopNumber: 1, status: "pending", eta: new Date(start.getTime() + 300_000) },
      { stopNumber: 2, status: "pending", eta: new Date(start.getTime() + 600_000) },
    ],
    ...overrides,
  } as SimulatableDeliveryRun;
}

function storeWith(runs: SimulatableDeliveryRun[]) {
  const recordSimulationTick = vi.fn(async () => {});
  const store: DeliveryStore = { listDeliveries: async () => [], listSimulatableRuns: async () => runs, recordSimulationTick };
  return { store, recordSimulationTick };
}

const at = (seconds: number) => new Date(start.getTime() + seconds * 1000);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("robot simulator", () => {
  it("moves the robot along its route and marks stops it has reached", async () => {
    const { store, recordSimulationTick } = storeWith([run()]);

    await advanceDeliverySimulator(store, { now: at(300), speedMultiplier: 1 });

    const tick = recordSimulationTick.mock.calls[0][0];
    expect(tick.latitude).toBeCloseTo(37.3432, 3);
    expect(tick.arrivedStopNumbers).toEqual([1]);
    expect(tick.completed).toBe(false);
  });

  it("finishes the run at the end of the route", async () => {
    const { store, recordSimulationTick } = storeWith([run({ stops: [{ stopNumber: 1, status: "delivered", eta: start }] } as Partial<SimulatableDeliveryRun>)]);

    await advanceDeliverySimulator(store, { now: at(700), speedMultiplier: 1 });

    expect(recordSimulationTick.mock.calls[0][0]).toMatchObject({ latitude: 37.3482, arrivedStopNumbers: [], completed: true });
  });

  it("runs 60 times faster than real time by default", async () => {
    const { store, recordSimulationTick } = storeWith([run()]);
    await advanceDeliverySimulator(store, { now: at(10) });
    expect(recordSimulationTick.mock.calls[0][0].completed).toBe(true);
  });

  it("handles short, empty and zero-length routes", async () => {
    const { store, recordSimulationTick } = storeWith([
      run({ runId: "empty", routeGeometry: [] }),
      run({ runId: "single", routeGeometry: [[-121.8, 37.3]] }),
      run({ runId: "still", routeGeometry: [[-121.8, 37.3], [-121.8, 37.3]] }),
      run({ runId: "bend", routeGeometry: [[-121.8, 37.3], [-121.8, 37.3], [-121.8, 37.4]] }),
    ]);

    const updated = await advanceDeliverySimulator(store, { now: at(300), speedMultiplier: 1 });

    expect(updated).toBe(3);
    const byRun = Object.fromEntries(recordSimulationTick.mock.calls.map(([tick]) => [tick.runId, tick]));
    expect(byRun.single.latitude).toBe(37.3);
    expect(byRun.still.latitude).toBe(37.3);
    expect(byRun.bend.latitude).toBeCloseTo(37.35, 3);
  });

  it("keeps the robot at the start before the run begins", async () => {
    const { store, recordSimulationTick } = storeWith([run({ createdAt: at(60) })]);
    await advanceDeliverySimulator(store, { now: start });
    expect(recordSimulationTick.mock.calls[0][0].latitude).toBe(37.3382);
  });

  it("does nothing without simulation storage", async () => {
    await expect(advanceDeliverySimulator({ listDeliveries: async () => [] })).resolves.toBe(0);
  });

  it("ticks in the background and logs failed ticks", async () => {
    vi.useFakeTimers();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const listSimulatableRuns = vi.fn(async () => { throw new Error("db down"); });
    const timer = startDeliverySimulator({ listDeliveries: async () => [], listSimulatableRuns, recordSimulationTick: async () => {} }, { intervalMs: 500 });

    await vi.advanceTimersByTimeAsync(1_000);

    expect(listSimulatableRuns).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledWith("Robot simulator tick failed.", expect.any(Error));
    clearInterval(timer);
  });

  it("skips a tick while the previous one is still running", async () => {
    vi.useFakeTimers();
    let finish = () => {};
    const listSimulatableRuns = vi.fn(() => new Promise<SimulatableDeliveryRun[]>((resolve) => { finish = () => resolve([]); }));
    const timer = startDeliverySimulator({ listDeliveries: async () => [], listSimulatableRuns, recordSimulationTick: async () => {} }, { intervalMs: 100 });

    await vi.advanceTimersByTimeAsync(350);
    expect(listSimulatableRuns).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(100);
    expect(listSimulatableRuns).toHaveBeenCalledTimes(2);
    clearInterval(timer);
  });

  it("falls back to safe settings when the configured ones are invalid", async () => {
    vi.useFakeTimers();
    vi.stubEnv("ROBOT_SIMULATOR_INTERVAL_MS", "-5");
    vi.stubEnv("ROBOT_SIMULATOR_SPEED_MULTIPLIER", "abc");
    const listSimulatableRuns = vi.fn(async () => []);
    const timer = startDeliverySimulator({ listDeliveries: async () => [], listSimulatableRuns, recordSimulationTick: async () => {} });

    await vi.advanceTimersByTimeAsync(999);
    expect(listSimulatableRuns).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(listSimulatableRuns).toHaveBeenCalledOnce();
    clearInterval(timer);
  });
});
