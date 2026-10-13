import { afterEach, describe, expect, it, vi } from "vitest";
import { addToCart, fetchCart, removeCartItem, updateCartItem } from "../src/cart/api";
import { toCartItem } from "../src/cart/types";
import { products } from "../src/inventory/InventoryPage";

const line = {
  cartItemId: "line-1",
  productId: "00000000-0000-4000-8000-000000000001",
  name: "Gala Apples",
  price: 1.49,
  weightLbs: 1,
  quantityInStock: 34,
  quantity: 2,
};

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cart api client", () => {
  it("loads the cart", async () => {
    const fetchMock = mockFetch(200, { items: [line] });
    await expect(fetchCart()).resolves.toEqual([line]);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/cart");
    expect(fetchMock.mock.calls[0][1].method).toBe("GET");
  });

  it("adds, updates, and removes items", async () => {
    const fetchMock = mockFetch(200, { items: [] });

    await addToCart(line.productId, 3);
    await updateCartItem(line.productId, 5);
    await removeCartItem(line.productId);

    const calls = fetchMock.mock.calls.map(([url, init]) => [init.method, url, init.body && JSON.parse(init.body)]);
    expect(calls).toEqual([
      ["POST", "/api/cart/items", { productId: line.productId, quantity: 3 }],
      ["PATCH", `/api/cart/items/${line.productId}`, { quantity: 5 }],
      ["DELETE", `/api/cart/items/${line.productId}`, undefined],
    ]);
  });

  it("throws the server's error message", async () => {
    mockFetch(409, { error: "Only 5 of Gala Apples are in stock." });
    await expect(addToCart(line.productId, 9)).rejects.toThrow("Only 5 of Gala Apples are in stock.");
  });
});

describe("toCartItem", () => {
  it("uses the server's price and stock with the catalog's display details", () => {
    const item = toCartItem({ ...line, price: 1.99 }, products);
    expect(item).toMatchObject({ id: line.productId, emoji: "🍎", unit: "lb", price: 1.99, quantity: 2 });
  });

  it("still works for products missing from the catalog", () => {
    const item = toCartItem({ ...line, productId: "unknown" }, products);
    expect(item).toMatchObject({ name: "Gala Apples", emoji: "🛒", unit: "each" });
  });
});
