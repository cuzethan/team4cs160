import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFailedPaymentsReport, fetchInventoryReport } from "../src/manager/api";
import { reportFailedPayment } from "../src/orders/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("manager reports API client", () => {
  it("requests the stock report for the selected range", async () => {
    const report = { range: "month", rangeDays: 30, summary: {}, products: [], movements: [], categories: [] };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ report }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchInventoryReport("month")).resolves.toEqual(report);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/manager/reports/inventory?range=month");
    expect(fetchMock.mock.calls[0][1].credentials).toBe("same-origin");
  });

  it("requests the failed payments report", async () => {
    const report = { range: "week", summary: { count: 0, previousCount: 0, amount: 0, customers: 0 }, reasons: [], payments: [] };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ report }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchFailedPaymentsReport("week")).resolves.toEqual(report);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/manager/reports/failed-payments?range=week");
  });

  it("surfaces the server's error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Manager access is required." }), { status: 403 }),
    ));
    await expect(fetchInventoryReport("week")).rejects.toThrow("Manager access is required.");
  });
});

describe("reporting a declined card", () => {
  it("sends the payment id to the server", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await reportFailedPayment("pi_declined");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/orders/payment-failed");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ paymentIntentId: "pi_declined" });
  });
});
