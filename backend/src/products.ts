import express from "express";
import { handle } from "./auth.js";
import type { ProductStore } from "./store.js";

// The catalog is public so shoppers can browse before logging in.
export function createProductRouter(productStore: ProductStore) {
  const router = express.Router();

  router.get("/", handle(async (_req, res) => {
    res.json({ products: await productStore.listProducts() });
  }));

  return router;
}
