import express from "express";
import { handle } from "./auth.js";
import { createCustomerGuard } from "./cart.js";
import { PaymentsNotConfiguredError, type PaymentIntentCreator } from "./payments.js";
import { CheckoutError, type AuthStore, type OrderStore } from "./store.js";

export type OrderOptions = {
  store: AuthStore;
  orderStore: OrderStore;
  payments: PaymentIntentCreator;
};

const ZIP_PATTERN = /^\d{5}(-\d{4})?$/;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function createOrderRouter({ store, orderStore, payments }: OrderOptions) {
  const router = express.Router();
  const requireCustomer = createCustomerGuard(store, "Please log in to see your orders and check out.");

  // Starts a Stripe PaymentIntent for the cart total. The browser uses the client secret
  // to collect the card; the amount is computed here, not taken from the request.
  router.post("/payment-intent", handle(async (req, res) => {
    const user = await requireCustomer(req, res);
    if (!user) return;

    try {
      const quote = await orderStore.quoteOrder(user.userId);
      const { clientSecret } = await payments.create({
        amountCents: Math.round(quote.grandTotal * 100),
        userId: user.userId,
      });
      res.json({ clientSecret });
    } catch (error) {
      if (error instanceof CheckoutError) return res.status(409).json({ error: error.message });
      if (error instanceof PaymentsNotConfiguredError) {
        return res.status(500).json({ error: "Card payments are not configured." });
      }
      throw error;
    }
  }));

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
