import express from "express";
import { findCurrentUser, handle } from "./auth.js";
import type { AuthStore, SalesRange, SalesStore } from "./store.js";

export type SalesOptions = {
  store: AuthStore;
  salesStore: SalesStore;
};

const ranges = new Set<SalesRange>(["today", "week", "month", "all"]);

export function createSalesRouter({ store, salesStore }: SalesOptions) {
  const router = express.Router();

  router.get("/", handle(async (req, res) => {
    const user = await findCurrentUser(store, req);
    if (!user) return res.status(401).json({ error: "Not logged in." });
    if (user.role !== "admin") return res.status(403).json({ error: "Manager access is required." });

    const range = req.query.range === undefined ? "week" : req.query.range;
    if (typeof range !== "string" || !ranges.has(range as SalesRange)) {
      return res.status(400).json({ error: "Choose a valid sales date range." });
    }

    res.json({ sales: await salesStore.listSales(range as SalesRange) });
  }));

  router.get("/analytics", handle(async (req, res) => {
    const user = await findCurrentUser(store, req);
    if (!user) return res.status(401).json({ error: "Not logged in." });
    if (user.role !== "admin") return res.status(403).json({ error: "Manager access is required." });

    const range = req.query.range === undefined ? "week" : req.query.range;
    if (typeof range !== "string" || !ranges.has(range as SalesRange)) {
      return res.status(400).json({ error: "Choose a valid sales date range." });
    }

    res.json({ analytics: await salesStore.listSalesAnalytics(range as SalesRange) });
  }));

  return router;
}