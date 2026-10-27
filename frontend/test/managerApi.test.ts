import { afterEach, describe, expect, it, vi } from "vitest";
import { createProduct, fetchDeliveries, fetchManagedInventory, fetchManagerAudit, fetchSales, fetchSalesAnalytics, refundDeliveryOrder, updateProduct } from "../src/manager/api";

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

  describe("manager deliveries API client", () => {
    it("requests delivery rows", async () => {
      const deliveries = [{
        orderId: "order-1",
        customerName: "Lee Nguyen",
        deliveryProgress: "Awaiting dispatch",
        eta: null,
      }];
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ deliveries }), { status: 200 }),
      );
      vi.stubGlobal("fetch", fetchMock);

      await expect(fetchDeliveries()).resolves.toEqual(deliveries);
      expect(fetchMock.mock.calls[0][0]).toBe("/api/manager/deliveries");
      expect(fetchMock.mock.calls[0][1].credentials).toBe("same-origin");
    });

    it("surfaces an API error", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Manager access is required." }), { status: 403 }),
      ));
      await expect(fetchDeliveries()).rejects.toThrow("Manager access is required.");
    });

    it("posts a refund for an undispatched order", async () => {
      const body = { orderId: "order-1", paymentStatus: "refunded", orderStatus: "cancelled" };
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      await expect(refundDeliveryOrder("order-1")).resolves.toEqual(body);
      expect(fetchMock.mock.calls[0][0]).toBe("/api/manager/deliveries/order-1/refund");
      expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", credentials: "same-origin" });
    });

    it("surfaces a robot-run conflict on refund", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "This order is on a robot run. Cancel the delivery run first, then refund." }), { status: 409 }),
      ));
      await expect(refundDeliveryOrder("order-2")).rejects.toThrow(/cancel the delivery run first/i);
    });
  });

  it("surfaces an API error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Manager access is required." }), { status: 403 }),
    ));
    await expect(fetchSales("all")).rejects.toThrow("Manager access is required.");
  });

  it("requests item and profit analytics for the selected range", async () => {
    const analytics = { profitBuckets: [], items: [], categories: [] };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ analytics }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSalesAnalytics("month")).resolves.toEqual(analytics);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/manager/sales/analytics?range=month");
    expect(fetchMock.mock.calls[0][1].credentials).toBe("same-origin");
  });
});
describe("manager product API client", () => {
  const product = {
    id: "p-1", name: "Red Lentils", category: "Grains", categoryId: "c-1", description: "",
    price: 3.25, unitCost: 1.75, weightLbs: 1, unit: "bag", quantityInStock: 200, imageUrl: null, active: true,
  };

  it("loads every product with the categories", async () => {
    const body = { products: [product], categories: [{ id: "c-1", name: "Grains" }] };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchManagedInventory()).resolves.toEqual(body);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/manager/inventory");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "GET", credentials: "same-origin" });
  });

  it("adds a product with its starting stock", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ product }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const input = { name: "Red Lentils", description: "", price: 3.25, unitCost: 1.75, weightLbs: 1, unit: "bag", categoryId: "c-1", quantityInStock: 200 };

    await expect(createProduct(input)).resolves.toEqual(product);
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(input);
  });

  it("sends only the changed fields when editing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ product: { ...product, active: false } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateProduct("p-1", { active: false })).resolves.toMatchObject({ active: false });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/manager/inventory/p-1");
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ active: false });
  });

  it("shows the server's error message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Choose a category." }), { status: 400 })));
    await expect(updateProduct("p-1", { categoryId: "nope" })).rejects.toThrow("Choose a category.");
  });

  it("loads the manager audit log", async () => {
    const entries = [{
      id: "a-1",
      source: "price" as const,
      createdAt: "2026-10-27T20:00:00.000Z",
      actorName: "Max Boss",
      summary: "Gala Apples: price $1.49 → $1.79",
      tableName: "Product",
      recordId: "p-1",
    }];
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ entries }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchManagerAudit(50)).resolves.toEqual(entries);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/manager/inventory/audit?limit=50");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "GET", credentials: "same-origin" });
  });
});
