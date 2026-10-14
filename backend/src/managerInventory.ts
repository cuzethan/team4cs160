import express from "express";
import { findCurrentUser, handle } from "./auth.js";
import type { AuthStore, ProductStore } from "./store.js";

export type ManagerInventoryOptions = {
  store: AuthStore;
  productStore: ProductStore;
};

export function createManagerInventoryRouter({ store, productStore }: ManagerInventoryOptions) {
  const router = express.Router();

  router.patch("/:productId/stock", handle(async (req, res) => {
    const user = await findCurrentUser(store, req);
    if (!user) return res.status(401).json({ error: "Not logged in." });
    if (user.role !== "admin") return res.status(403).json({ error: "Manager access is required." });

    const adjustment = req.body?.adjustment;
    if (
      !Number.isSafeInteger(adjustment) ||
      adjustment === 0 ||
      Math.abs(adjustment) > 2147483647
    ) {
      return res.status(400).json({ error: "Enter a valid stock adjustment." });
    }

    const result = await productStore.adjustStock(req.params.productId, adjustment);
    if (result.status === "not-found") {
      return res.status(404).json({ error: "Product not found." });
    }
    if (result.status === "insufficient-stock") {
      return res.status(409).json({ error: "Stock quantity cannot be less than zero." });
    }
    if (result.status === "maximum-stock") {
      return res.status(409).json({ error: "Stock quantity is at its maximum." });
    }

    res.json({ quantityInStock: result.quantityInStock });
  }));

  return router;
}
