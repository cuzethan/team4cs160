import { afterEach, describe, expect, it, vi } from "vitest";
import { createPaymentIntent, fetchLatestCheckoutAddress, fetchMyOrders, formatDeliveryEstimate, placeOrder, validateDeliveryAddress } from "../src/orders/api";
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

    const order = await placeOrder(address, "pi_test");
    expect(order).toMatchObject({ id: record.orderId, date: record.createdAt, status: "placed", grandTotal: 2.98 });
    expect(order.items[0]).toMatchObject({ productName: "Gala Apples", quantity: 2, price_at_purchase: 1.49 });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/orders");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ address, paymentIntentId: "pi_test" });
  });

  it("loads the customer's orders", async () => {
    mockFetch(200, { orders: [record] });
    const orders = await fetchMyOrders();
    expect(orders.map((order) => order.id)).toEqual([record.orderId]);
  });

  it("loads the latest saved checkout address", async () => {
    const fetchMock = mockFetch(200, { address });

    await expect(fetchLatestCheckoutAddress()).resolves.toEqual(address);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/orders/latest-address");
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("same-origin");
  });

  it("starts a payment intent and returns the client secret", async () => {
    const fetchMock = mockFetch(200, { clientSecret: "pi_test_secret", customerSessionClientSecret: "cuss_test_secret" });

    await expect(createPaymentIntent()).resolves.toEqual({ clientSecret: "pi_test_secret", customerSessionClientSecret: "cuss_test_secret" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/orders/payment-intent");
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
  });

  it("throws the server's error message", async () => {
    mockFetch(409, { error: "Your cart is empty." });
    await expect(placeOrder(address, "pi_test")).rejects.toThrow("Your cart is empty.");
  });
});

describe("deliveryFeeFor", () => {
  it("is free under 20 lbs and $10 from 20 lbs up", () => {
    expect(deliveryFeeFor(19.9)).toBe(0);
    expect(deliveryFeeFor(20)).toBe(10);
  });
});

describe("delivery estimate at checkout", () => {
  it("returns the server's estimate when the address is in range", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ eligible: true, estimatedMinutes: 75 }), { status: 200 })));
    const address = { street: "1 Main St", city: "San Jose", state: "CA", zipCode: "95112", deliveryInstructions: "" };
    expect(await validateDeliveryAddress(address)).toBe(75);
  });

  it("reads as hours and minutes with an arrival time", () => {
    const from = new Date(2026, 10, 17, 14, 0);
    expect(formatDeliveryEstimate(45, from).duration).toBe("About 45 min");
    expect(formatDeliveryEstimate(60, from).duration).toBe("About 1 hr");
    expect(formatDeliveryEstimate(95, from)).toEqual({ duration: "About 1 hr 35 min", arrival: expect.stringMatching(/^3:35/) });
  });
});
