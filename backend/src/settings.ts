import express from "express";
import { findCurrentUser, handle } from "./auth.js";
import type { AuthStore, SettingsStore } from "./store.js";

export function createSettingsRouter(store: AuthStore, settingsStore: SettingsStore) {
  const router = express.Router();
  router.get("/", handle(async (_req, res) => {
    res.json(await settingsStore.get());
  }));

  router.put("/", handle(async (req, res) => {
    const user = await findCurrentUser(store, req);
    if (!user) return res.status(401).json({ error: "Not logged in." });
    if (user.role !== "admin") return res.status(403).json({ error: "Manager access is required." });

    const { deliveryFee, freeDeliveryWeightThreshold, maxDeliveryDistanceMiles } = req.body ?? {};
    if (typeof deliveryFee !== "number" || !Number.isFinite(deliveryFee) || deliveryFee < 0) {
      return res.status(400).json({ error: "Delivery fee must be a nonnegative number." });
    }
    if (typeof freeDeliveryWeightThreshold !== "number" || !Number.isFinite(freeDeliveryWeightThreshold) || freeDeliveryWeightThreshold <= 0) {
      return res.status(400).json({ error: "Free-delivery weight threshold must be greater than zero." });
    }
    if (typeof maxDeliveryDistanceMiles !== "number" || !Number.isFinite(maxDeliveryDistanceMiles) || maxDeliveryDistanceMiles <= 0) {
      return res.status(400).json({ error: "Maximum delivery distance must be greater than zero miles." });
    }

    res.json(await settingsStore.update({ deliveryFee, freeDeliveryWeightThreshold, maxDeliveryDistanceMiles }));
  }));
  return router;
}
