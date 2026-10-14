import { afterEach, describe, expect, it, vi } from "vitest";
import { adjustProductStock, fetchProducts } from "../src/inventory/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("products api client", () => {
  it("loads products and adds a placeholder emoji", async () => {
    const product = {
      id: "p-1",
      name: "Gala Apples",
      category: "Fruits",
      description: "Sweet and crisp.",
      price: 1.49,
      weightLbs: 1,
      unit: "lb",
      quantityInStock: 34,
      imageUrl: null,
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ products: [product] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchProducts()).resolves.toEqual([{ ...product, emoji: "🍎" }]);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("/api/products");
  });

  it("explains when the server can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(fetchProducts()).rejects.toThrow("Can't reach the server");
  });

  it("sends manager stock adjustments and returns the updated quantity", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ quantityInStock: 35 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(adjustProductStock("p-1", 1)).resolves.toBe(35);
    expect(fetchMock).toHaveBeenCalledWith("/api/manager/inventory/p-1/stock", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adjustment: 1 }),
      credentials: "same-origin",
    });
  });
});
