import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchManagerOrders, orderGroup, orderMatchesSearch, type ManagerOrder } from "../src/manager/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

const order: ManagerOrder = {
  orderId: "a1b2c3d4-0000-4000-8000-000000000000",
  createdAt: "2026-11-17T10:00:00.000Z",
  orderStatus: "placed",
  paymentStatus: "paid",
  subtotal: 8.97,
  deliveryFee: 0,
  grandTotal: 8.97,
  totalWeight: 4,
  customerId: "c-1",
  customerName: "Lee Nguyen",
  customerEmail: "lee@ofs.com",
  items: [{ orderItemId: "i-1", productId: "p-1", productName: "Gala Apples", quantity: 2, priceAtPurchase: 1.49 }],
};

describe("manager orders", () => {
  it("puts each order under one status filter, with refunds ahead of cancellations", () => {
    expect(orderGroup({ orderStatus: "placed", paymentStatus: "paid" })).toBe("pending");
    expect(orderGroup({ orderStatus: "out_for_delivery", paymentStatus: "paid" })).toBe("out_for_delivery");
    expect(orderGroup({ orderStatus: "completed", paymentStatus: "paid" })).toBe("completed");
    expect(orderGroup({ orderStatus: "cancelled", paymentStatus: "paid" })).toBe("cancelled");
    expect(orderGroup({ orderStatus: "cancelled", paymentStatus: "refunded" })).toBe("refunded");
  });

  it("searches by customer, email, order number, and item", () => {
    expect(orderMatchesSearch(order, "")).toBe(true);
    expect(orderMatchesSearch(order, "nguyen")).toBe(true);
    expect(orderMatchesSearch(order, "LEE@OFS")).toBe(true);
    expect(orderMatchesSearch(order, "#A1B2C3D4")).toBe(true);
    expect(orderMatchesSearch(order, "apples")).toBe(true);
    expect(orderMatchesSearch(order, "rice")).toBe(false);
  });

  it("loads orders and passes on the server's error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ orders: [order] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchManagerOrders()).toEqual([order]);
    expect(fetchMock).toHaveBeenCalledWith("/api/manager/orders", { credentials: "same-origin" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Manager access is required." }), { status: 403 })));
    await expect(fetchManagerOrders()).rejects.toThrow("Manager access is required.");
  });
});
