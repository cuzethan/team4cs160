import express from "express";
import { handle } from "./auth.js";
import { createCustomerGuard } from "./cart.js";
import { CheckoutError, type AuthStore, type OrderStore } from "./store.js";

export type OrderOptions = {
  store: AuthStore;
  orderStore: OrderStore;
};

const ZIP_PATTERN = /^\d{5}(-\d{4})?$/;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function createOrderRouter({ store, orderStore }: OrderOptions) {
  const router = express.Router();
  const requireCustomer = createCustomerGuard(store, "Please log in to see your orders and check out.");

  // Checkout: turns the customer's cart into an order. Payment is simulated.
  router.post("/", handle(async (req, res) => {
    const user = await requireCustomer(req, res);
    if (!user) return;

    const address = {
      street: text(req.body?.address?.street),
      city: text(req.body?.address?.city),
      state: text(req.body?.address?.state),
      zipCode: text(req.body?.address?.zipCode),
      deliveryInstructions: text(req.body?.address?.deliveryInstructions),
    };
    if (!address.street || !address.city || !address.state || !address.zipCode) {
      return res.status(400).json({ error: "Please fill in your street, city, state, and ZIP code." });
    }
    if (!ZIP_PATTERN.test(address.zipCode)) {
      return res.status(400).json({ error: "Please enter a valid ZIP code." });
    }

    try {
      const order = await orderStore.placeOrder(user.userId, address);
      res.status(201).json({ order });
    } catch (error) {
      if (error instanceof CheckoutError) return res.status(409).json({ error: error.message });
      throw error;
    }
  }));

  router.get("/mine", handle(async (req, res) => {
    const user = await requireCustomer(req, res);
    if (user) res.json({ orders: await orderStore.listOrders(user.userId) });
  }));

  return router;
}
