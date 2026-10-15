import express from "express";
import { findCurrentUser, handle } from "./auth.js";
import type { AuthStore, DeliveryStore } from "./store.js";

export type ManagerDeliveriesOptions = {
  store: AuthStore;
  deliveryStore: DeliveryStore;
};

export function createManagerDeliveriesRouter({ store, deliveryStore }: ManagerDeliveriesOptions) {
  const router = express.Router();

  router.get("/", handle(async (req, res) => {
    const user = await findCurrentUser(store, req);
    if (!user) return res.status(401).json({ error: "Not logged in." });
    if (user.role !== "admin") return res.status(403).json({ error: "Manager access is required." });

    res.json({ deliveries: await deliveryStore.listDeliveries() });
  }));

  return router;
}
