import express from "express";
import { handle } from "./auth.js";
import { createCustomerGuard } from "./cart.js";
import { PaymentsNotConfiguredError, type PaymentIntentCreator } from "./payments.js";
import { distanceInMiles } from "./deliveryArea.js";
import { geocodeAddress, type GeocodedLocation } from "./geocoder.js";
import type { ReportsStore } from "./reports.js";
import { CheckoutError, type AuthStore, type DeliveryStore, type OrderStore, type SettingsStore } from "./store.js";

export type OrderOptions = {
  store: AuthStore;
  orderStore: OrderStore;
  deliveryStore?: DeliveryStore;
  settingsStore: SettingsStore;
  payments: PaymentIntentCreator;
  reportsStore?: ReportsStore;
  geocode?: typeof geocodeAddress;
};

const ZIP_PATTERN = /^\d{5}(-\d{4})?$/;
type DeliveryAddress = { street: string; city: string; state: string; zipCode: string };

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function createOrderRouter({ store, orderStore, deliveryStore, settingsStore, payments, reportsStore, geocode = geocodeAddress }: OrderOptions) {
  const router = express.Router();
  const requireCustomer = createCustomerGuard(store, "Please log in to see your orders and check out.");

  async function checkDeliveryAddress(address: DeliveryAddress) {
    let location: GeocodedLocation | null;
    try {
      location = await geocode(address);
    } catch {
      return { status: 503 as const, error: "We couldn't verify this delivery address right now. Please try again." };
    }
    if (!location) {
      return { status: 400 as const, error: "We couldn't locate this delivery address. Please check the address and try again." };
    }

    const [base, settings] = await Promise.all([settingsStore.getRobotBase(), settingsStore.get()]);
    const distance = distanceInMiles(location, base);
    if (distance > settings.deliveryRadiusMiles) {
      return {
        status: 400 as const,
        error: `Delivery is limited to ${settings.deliveryRadiusMiles} miles from the distribution center. This address is approximately ${distance.toFixed(1)} miles away.`,
      };
    }
    return null;
  }

  router.post("/validate-address", handle(async (req, res) => {
    const user = await requireCustomer(req, res);
    if (!user) return;
    const address = {
      street: text(req.body?.address?.street),
      city: text(req.body?.address?.city),
      state: text(req.body?.address?.state),
      zipCode: text(req.body?.address?.zipCode),
    };
    if (!address.street || !address.city || !address.state || !address.zipCode) {
      return res.status(400).json({ error: "Please fill in your street, city, state, and ZIP code." });
    }
    if (!ZIP_PATTERN.test(address.zipCode)) return res.status(400).json({ error: "Please enter a valid ZIP code." });

    const result = await checkDeliveryAddress(address);
    if (result) return res.status(result.status).json({ error: result.error });
    res.json({ eligible: true });
  }));

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

  // Saves a declined card for the manager's failed-payments report. The details come from
  // Stripe, not the request, so a customer can only report their own real declines.
  router.post("/payment-failed", handle(async (req, res) => {
    const user = await requireCustomer(req, res);
    if (!user) return;

    const paymentIntentId = text(req.body?.paymentIntentId);
    if (!paymentIntentId) return res.status(400).json({ error: "Payment id is required." });

    try {
      const failure = await payments.retrieveFailure(paymentIntentId);
      if (!failure || failure.userId !== user.userId) {
        return res.status(404).json({ error: "No declined payment was found." });
      }
      await reportsStore?.recordFailedPayment({
        userId: user.userId,
        paymentIntentId: failure.id,
        chargeId: failure.chargeId,
        amountCents: failure.amountCents,
        failureCode: failure.failureCode,
        declineCode: failure.declineCode,
        message: failure.message,
      });
      res.status(204).end();
    } catch (error) {
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

      const deliveryCheck = await checkDeliveryAddress(address);
      if (deliveryCheck) return res.status(deliveryCheck.status).json({ error: deliveryCheck.error });

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
