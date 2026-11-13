import { describe, expect, it } from "vitest";
import type { CustomerNotification } from "../src/notifications/api";
import { unreadCount } from "../src/notifications/DeliveryUpdatesMenu";

function notification(id: string, isRead: boolean): CustomerNotification {
  return {
    notificationId: id,
    orderId: "order-1",
    type: "delivery",
    message: "Your order is on the way.",
    isRead,
    createdAt: "2026-11-01T12:00:00Z",
    readAt: isRead ? "2026-11-01T12:05:00Z" : null,
  };
}

describe("unreadCount", () => {
  it("counts only unread notifications", () => {
    expect(unreadCount([])).toBe(0);
    expect(unreadCount([notification("a", false), notification("b", true), notification("c", false)])).toBe(2);
  });
});
