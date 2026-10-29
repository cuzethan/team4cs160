import express from "express";
import { findCurrentUser, handle } from "./auth.js";
import type { AuthStore, SettingsStore } from "./store.js";
import { configureRobotBaseLocation } from "./robotBase.js";

export function createSettingsRouter(store: AuthStore, settingsStore: SettingsStore) {
  const router = express.Router();
  router.get("/", handle(async (_req, res) => {
    res.json(await settingsStore.get());
  }));

  router.put("/", handle(async (req, res) => {
    const user = await findCurrentUser(store, req);
    if (!user) return res.status(401).json({ error: "Not logged in." });
    if (user.role !== "admin") return res.status(403).json({ error: "Manager access is required." });

    const { deliveryFee, freeDeliveryWeightThreshold } = req.body ?? {};
    if (typeof deliveryFee !== "number" || !Number.isFinite(deliveryFee) || deliveryFee < 0) {
      return res.status(400).json({ error: "Delivery fee must be a nonnegative number." });
    }
    if (typeof freeDeliveryWeightThreshold !== "number" || !Number.isFinite(freeDeliveryWeightThreshold) || freeDeliveryWeightThreshold <= 0) {
      return res.status(400).json({ error: "Free-delivery weight threshold must be greater than zero." });
    }

    res.json(await settingsStore.update({ deliveryFee, freeDeliveryWeightThreshold }));
  }));
  router.get("/robot-base", handle(async (_req, res) => {
    res.json(await settingsStore.getRobotBase());
  }));
  router.put("/robot-base", handle(async (req, res) => {
    const user = await findCurrentUser(store, req);
    if (!user) return res.status(401).json({ error: "Not logged in." });
    if (user.role !== "admin") return res.status(403).json({ error: "Manager access is required." });
    const { latitude, longitude } = req.body ?? {};
    if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) return res.status(400).json({ error: "Latitude must be a number between -90 and 90." });
    if (typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return res.status(400).json({ error: "Longitude must be a number between -180 and 180." });
    const base = await settingsStore.updateRobotBase({ latitude, longitude });
    configureRobotBaseLocation(base);
    res.json(base);
  }));
  return router;
}
