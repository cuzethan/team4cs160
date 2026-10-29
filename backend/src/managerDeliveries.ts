import express from "express";
import { findCurrentUser, handle } from "./auth.js";
import { dispatchPendingOrders } from "./batching.js";
import type { AuthStore, DeliveryStore, SettingsStore } from "./store.js";

export type ManagerDeliveriesOptions = {
  store: AuthStore;
  deliveryStore: DeliveryStore;
  settingsStore: SettingsStore;
};

export function createManagerDeliveriesRouter({ store, deliveryStore, settingsStore }: ManagerDeliveriesOptions) {
  const router = express.Router();

  router.get("/", handle(async (req, res) => {
    const user = await findCurrentUser(store, req);
    if (!user) return res.status(401).json({ error: "Not logged in." });
    if (user.role !== "admin") return res.status(403).json({ error: "Manager access is required." });

    res.json({ deliveries: await deliveryStore.listDeliveries() });
  }));

  router.get("/robots", handle(async (req, res) => {
    const user = await findCurrentUser(store, req);
    if (!user) return res.status(401).json({ error: "Not logged in." });
    if (user.role !== "admin") return res.status(403).json({ error: "Manager access is required." });
    if (!deliveryStore.listRobots) return res.status(501).json({ error: "Robot data is not available." });
    res.json({ robots: await deliveryStore.listRobots() });
  }));

  router.get("/runs", handle(async (req, res) => {
    const user = await findCurrentUser(store, req);
    if (!user) return res.status(401).json({ error: "Not logged in." });
    if (user.role !== "admin") return res.status(403).json({ error: "Manager access is required." });
    if (!deliveryStore.listRuns) return res.status(501).json({ error: "Delivery run data is not available." });
    res.json({ runs: await deliveryStore.listRuns() });
  }));

  router.post("/runs/:runId/cancel", handle(async (req, res) => {
    const user = await findCurrentUser(store, req);
    if (!user) return res.status(401).json({ error: "Not logged in." });
    if (user.role !== "admin") return res.status(403).json({ error: "Manager access is required." });
    if (!deliveryStore.cancelDeliveryRun) return res.status(501).json({ error: "Stopping delivery runs is not available." });
    const result = await deliveryStore.cancelDeliveryRun(req.params.runId);
    if (result === "not-found") return res.status(404).json({ error: "Delivery run not found." });
    if (result === "not-active") return res.status(409).json({ error: "This delivery run is no longer active." });
    res.json({ runId: req.params.runId, status: "cancelled" });
  }));

  router.post("/dispatch", handle(async (req, res) => {
    const user = await findCurrentUser(store, req);
    if (!user) return res.status(401).json({ error: "Not logged in." });
    if (user.role !== "admin") return res.status(403).json({ error: "Manager access is required." });
    const settings = await settingsStore.get();
    const result = await dispatchPendingOrders(deliveryStore, {
      photonUrl: process.env.PHOTON_URL,
      maxDeliveryDistanceMiles: settings.maxDeliveryDistanceMiles,
    });
    res.json(result);
  }));

  router.post("/:orderId/refund", handle(async (req, res) => {
    const user = await findCurrentUser(store, req);
    if (!user) return res.status(401).json({ error: "Not logged in." });
    if (user.role !== "admin") return res.status(403).json({ error: "Manager access is required." });
    if (!deliveryStore.refundOrder) return res.status(501).json({ error: "Order refunds are not available." });

    const result = await deliveryStore.refundOrder(user.userId, req.params.orderId);
    if (result === "not-found") return res.status(404).json({ error: "Order not found." });
    if (result === "already-refunded") {
      return res.status(409).json({ error: "This order was already refunded." });
    }
    if (result === "already-completed") {
      return res.status(409).json({ error: "Completed orders cannot be refunded." });
    }
    if (result === "already-dispatched") {
      return res.status(409).json({
        error: "This order is on a robot run. Cancel the delivery run first, then refund.",
      });
    }
    res.json({ orderId: req.params.orderId, paymentStatus: "refunded", orderStatus: "cancelled" });
  }));

  return router;
}
