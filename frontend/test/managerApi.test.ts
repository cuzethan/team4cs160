import { afterEach, describe, expect, it, vi } from "vitest";
import { createProduct, fetchDeliveries, fetchManagedInventory, fetchSales, updateProduct } from "../src/manager/api";

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
  });

  it("surfaces an API error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Manager access is required." }), { status: 403 }),
    ));
    await expect(fetchSales("all")).rejects.toThrow("Manager access is required.");
  });
});
describe("manager product API client", () => {
  const product = {
    id: "p-1", name: "Red Lentils", category: "Grains", categoryId: "c-1", description: "",
    price: 3.25, weightLbs: 1, unit: "bag", quantityInStock: 200, imageUrl: null, active: true,
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
    const input = { name: "Red Lentils", description: "", price: 3.25, weightLbs: 1, unit: "bag", categoryId: "c-1", quantityInStock: 200 };

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
});
