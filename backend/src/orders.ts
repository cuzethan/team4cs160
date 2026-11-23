import express from "express";
import { handle } from "./auth.js";
import { createCustomerGuard } from "./cart.js";
import { PaymentsNotConfiguredError, type PaymentIntentCreator } from "./payments.js";
import { distanceInMiles, estimateDeliveryMinutes } from "./deliveryArea.js";
import { geocodeAddress, matchesTypedAddress, suggestAddresses, type AddressSuggestion, type GeocodedLocation } from "./geocoder.js";
import type { ReportsStore } from "./reports.js";
import { CheckoutError, PaymentAlreadyUsedError, type AuthStore, type DeliveryStore, type OrderStore, type SettingsStore } from "./store.js";

export type OrderOptions = {
  store: AuthStore;
  orderStore: OrderStore;
  deliveryStore?: DeliveryStore;
  settingsStore: SettingsStore;
  payments: PaymentIntentCreator;
  reportsStore?: ReportsStore;
  geocode?: typeof geocodeAddress;
  suggest?: typeof suggestAddresses;
};

const ZIP_PATTERN = /^\d{5}(-\d{4})?$/;
type DeliveryAddress = { street: string; city: string; state: string; zipCode: string };

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function createOrderRouter({ store, orderStore, deliveryStore, settingsStore, payments, reportsStore, geocode = geocodeAddress, suggest = suggestAddresses }: OrderOptions) {
  const router = express.Router();
  const requireCustomer = createCustomerGuard(store, "Please log in to see your orders and check out.");

  async function checkDeliveryAddress(address: DeliveryAddress) {
    let location: GeocodedLocation | null;
    try {
      location = await geocode(address);
    } catch {
      return { ok: false as const, status: 503 as const, error: "We couldn't verify this delivery address right now. Please try again." };
    }
    if (!location) {
      return { ok: false as const, status: 400 as const, error: "We couldn't locate this delivery address. Please check the address and try again." };
    }

    const [base, settings] = await Promise.all([settingsStore.getRobotBase(), settingsStore.get()]);
    const distance = distanceInMiles(location, base);
    if (distance > settings.deliveryRadiusMiles) {
      return {
        ok: false as const,
        status: 400 as const,
        error: `Delivery is limited to ${settings.deliveryRadiusMiles} miles from the distribution center. This address is approximately ${distance.toFixed(1)} miles away.`,
      };
    }
    return { ok: true as const, distanceMiles: distance, location };
  }

  // Address suggestions while the shopper types the street at checkout.
  router.get("/address-suggestions", handle(async (req, res) => {
    const user = await requireCustomer(req, res);
    if (!user) return;
    const query = text(req.query.q).slice(0, 200);
    // The shopper's own past addresses come first, and still work when the map service is down.
    const saved = (await orderStore.listAddresses?.(user.userId) ?? [])
      .map(({ street, city, state, zipCode }) => ({ label: `${street}, ${city}, ${state} ${zipCode}`, street, city, state, zipCode }));
    const own = saved.filter((address) => matchesTypedAddress(address.label, query));
    if (query.length < 3) return res.json({ suggestions: own.slice(0, 3) });
    let found: AddressSuggestion[];
    try {
      found = await suggest(query);
    } catch {
      return res.json({ suggestions: own, unavailable: true });
    }
    const labels = new Set(own.map((address) => address.label.toLowerCase()));
    res.json({ suggestions: [...own, ...found.filter((address) => !labels.has(address.label.toLowerCase()))].slice(0, 6) });
  }));

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
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    res.json({ eligible: true, estimatedMinutes: estimateDeliveryMinutes(result.distanceMiles) });
  }));

  // Starts a Stripe PaymentIntent for the cart total. The browser uses the client secret
  // to collect the card; the amount is computed here, not taken from the request.
  router.post("/payment-intent", handle(async (req, res) => {
    const user = await requireCustomer(req, res);
    if (!user) return;

    try {
      const quote = await orderStore.quoteOrder(user.userId);
      const { clientSecret, customerSessionClientSecret } = await payments.create({
        amountCents: Math.round(quote.grandTotal * 100),
        userId: user.userId,
      });
      res.json({ clientSecret, customerSessionClientSecret: customerSessionClientSecret ?? null });
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

      // From here the card has been charged, so if the order can't be saved the money goes back.
      const refundWith = async (status: number, reason: string) => {
        let refunded = false;
        try {
          if (payments.refund) {
            await payments.refund(payment.id);
            refunded = true;
          }
        } catch (refundError) {
          console.error("Refund failed for unplaced order", payment.id, refundError);
        }
        res.status(status).json({
          error: refunded
            ? `${reason} Your payment was refunded, so you weren't charged.`
            : `${reason} Your card was charged; please contact us for a refund instead of paying again.`,
        });
      };

      if (payment.amountCents !== Math.round(quote.grandTotal * 100)) {
        return refundWith(409, "Your cart total changed. Refresh checkout and pay again.");
      }

      try {
        // The location found here is saved with the address, so dispatch doesn't have to look it up again.
        const deliveryCheck = await checkDeliveryAddress(address);
        if (!deliveryCheck.ok) return refundWith(deliveryCheck.status, deliveryCheck.error);

        const order = await orderStore.placeOrder(user.userId, address, {
          paymentIntentId: payment.id,
          amountCents: payment.amountCents,
        }, deliveryCheck.location);
        return res.status(201).json({ order });
      } catch (error) {
        // A payment that already paid for an order keeps paying for it.
        if (error instanceof PaymentAlreadyUsedError) return res.status(409).json({ error: error.message });
        if (error instanceof CheckoutError) return refundWith(409, error.message);
        console.error("Order could not be saved", error);
        return refundWith(500, "We couldn't save your order.");
      }
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
