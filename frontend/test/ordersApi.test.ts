import { afterEach, describe, expect, it, vi } from "vitest";
import { createPaymentIntent, fetchMyOrders, placeOrder } from "../src/orders/api";
import { deliveryFeeFor } from "../src/cart/delivery";

const record = {
  orderId: "11111111-2222-4333-8444-555555555555",
  createdAt: "2026-10-13T08:00:00.000Z",
  orderStatus: "placed",
  grandTotal: 2.98,
  items: [
    { orderItemId: "item-1", productId: "p-1", productName: "Gala Apples", quantity: 2, priceAtPurchase: 1.49, weightAtPurchase: 1 },
  ],
};

const address = { street: "1 Washington Sq", city: "San Jose", state: "CA", zipCode: "95192", deliveryInstructions: "" };

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("orders api client", () => {
  it("places an order with the address and returns it in the order-history shape", async () => {
    const fetchMock = mockFetch(201, { order: record });

    const order = await placeOrder(address);
    expect(order).toMatchObject({ id: record.orderId, date: record.createdAt, status: "placed", grandTotal: 2.98 });
    expect(order.items[0]).toMatchObject({ productName: "Gala Apples", quantity: 2, price_at_purchase: 1.49 });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/orders");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ address });
  });

  it("loads the customer's orders", async () => {
    mockFetch(200, { orders: [record] });
    const orders = await fetchMyOrders();
    expect(orders.map((order) => order.id)).toEqual([record.orderId]);
  });

  it("starts a payment intent and returns the client secret", async () => {
    const fetchMock = mockFetch(200, { clientSecret: "pi_test_secret" });

    await expect(createPaymentIntent()).resolves.toBe("pi_test_secret");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/orders/payment-intent");
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
  });

  it("throws the server's error message", async () => {
    mockFetch(409, { error: "Your cart is empty." });
    await expect(placeOrder(address)).rejects.toThrow("Your cart is empty.");
  });
});

describe("deliveryFeeFor", () => {
  it("is free under 20 lbs and $10 from 20 lbs up", () => {
    expect(deliveryFeeFor(19.9)).toBe(0);
    expect(deliveryFeeFor(20)).toBe(10);
  });
});
