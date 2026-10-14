import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSales } from "../src/manager/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("manager sales API client", () => {
  it("requests payment buckets for the selected range", async () => {
    const sales = [{ bucketStart: "2026-10-14T00:00:00.000Z", paidOrders: 2, revenue: 31.5 }];
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sales }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSales("week")).resolves.toEqual(sales);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/manager/sales?range=week");
    expect(fetchMock.mock.calls[0][1].credentials).toBe("same-origin");
  });

  it("surfaces an API error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Manager access is required." }), { status: 403 }),
    ));
    await expect(fetchSales("all")).rejects.toThrow("Manager access is required.");
  });
});