import express from "express";
import { handle } from "./auth.js";
import { createCustomerGuard } from "./cart.js";
import { PaymentsNotConfiguredError, type PaymentIntentCreator } from "./payments.js";
import { CheckoutError, type AuthStore, type DeliveryStore, type OrderStore } from "./store.js";

export type OrderOptions = {
  store: AuthStore;
  orderStore: OrderStore;
  deliveryStore?: DeliveryStore;
  payments: PaymentIntentCreator;
};

const ZIP_PATTERN = /^\d{5}(-\d{4})?$/;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function createOrderRouter({ store, orderStore, deliveryStore, payments }: OrderOptions) {
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

  router.get("/latest-address", handle(async (req, res) => {
    const user = await requireCustomer(req, res);
    if (user) res.json({ address: await orderStore.getLatestAddress(user.userId) });
  }));

  // Checkout: saves the order only after Stripe confirms the charge for this cart.
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

    const paymentIntentId = text(req.body?.paymentIntentId);

    try {
      const quote = await orderStore.quoteOrder(user.userId);
      if (!paymentIntentId) {
        return res.status(400).json({ error: "Please pay with a card before placing your order." });
      }

      const payment = await payments.retrieveSucceeded(paymentIntentId);
      if (!payment || payment.userId !== user.userId) {
        return res.status(402).json({ error: "Your payment could not be verified." });
      }
      if (payment.amountCents !== Math.round(quote.grandTotal * 100)) {
        return res.status(409).json({ error: "Your cart total changed. Refresh checkout and pay again." });
      }

      const order = await orderStore.placeOrder(user.userId, address, {
        paymentIntentId: payment.id,
        amountCents: payment.amountCents,
      });
      res.status(201).json({ order });
    } catch (error) {
      if (error instanceof CheckoutError) return res.status(409).json({ error: error.message });
      if (error instanceof PaymentsNotConfiguredError) {
        return res.status(500).json({ error: "Card payments are not configured." });
      }
      throw error;
    }
  }));

  router.get("/mine", handle(async (req, res) => {
    const user = await requireCustomer(req, res);
    if (user) res.json({ orders: await orderStore.listOrders(user.userId) });
  }));

  router.get("/:orderId/tracking", handle(async (req, res) => {
    const user = await requireCustomer(req, res);
    if (!user) return;
    if (!deliveryStore?.getCustomerTracking) return res.status(501).json({ error: "Delivery tracking is not available." });
    const tracking = await deliveryStore.getCustomerTracking(user.userId, req.params.orderId);
    if (!tracking) return res.status(404).json({ error: "Order not found." });
    res.json({ tracking });
  }));

  router.post("/:orderId/received", handle(async (req, res) => {
    const user = await requireCustomer(req, res);
    if (!user) return;
    if (!deliveryStore?.confirmOrderReceived) return res.status(501).json({ error: "Order confirmation is not available." });
    const result = await deliveryStore.confirmOrderReceived(user.userId, req.params.orderId);
    if (result === "not-found") return res.status(404).json({ error: "Order not found." });
    if (result === "not-delivered") return res.status(409).json({ error: "This order has not been delivered yet." });
    res.json({ orderId: req.params.orderId, orderStatus: "completed" });
  }));

  return router;
}
