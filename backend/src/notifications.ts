import express from "express";
import { findCurrentUser, handle } from "./auth.js";
import type { AuthStore, DeliveryStore } from "./store.js";

export function createNotificationsRouter(store: AuthStore, deliveryStore: DeliveryStore) {
  const router = express.Router();

  router.get("/", handle(async (req, res) => {
    const user = await findCurrentUser(store, req);
    if (!user) return res.status(401).json({ error: "Not logged in." });
    if (!deliveryStore.listNotifications) return res.status(501).json({ error: "Notifications are not available." });
    res.json({ notifications: await deliveryStore.listNotifications(user.userId) });
  }));

  router.patch("/:notificationId/read", handle(async (req, res) => {
    const user = await findCurrentUser(store, req);
    if (!user) return res.status(401).json({ error: "Not logged in." });
    if (!deliveryStore.markNotificationRead) return res.status(501).json({ error: "Notifications are not available." });
    const updated = await deliveryStore.markNotificationRead(user.userId, req.params.notificationId);
    if (!updated) return res.status(404).json({ error: "Notification not found." });
    res.json({ notificationId: req.params.notificationId, isRead: true });
  }));

  return router;
}
