import Stripe from "stripe";

export type PaymentIntentRequest = {
  amountCents: number;
  userId: string;
};

// The Stripe customer saved for each shopper, so their saved cards follow them between orders.
export type StripeCustomerStore = {
  find(userId: string): Promise<string | null>;
  save(userId: string, customerId: string): Promise<void>;
};

export type ConfirmedPayment = {
  id: string;
  amountCents: number;
  userId: string;
};

export type FailedPaymentAttempt = {
  id: string;
  chargeId: string | null;
  amountCents: number;
  userId: string;
  failureCode: string | null;
  declineCode: string | null;
  message: string;
};

// The bit of Stripe the checkout route needs. Tests pass a fake instead of calling Stripe.
export type PaymentIntentCreator = {
  // customerSessionClientSecret lets the card form show saved cards and offer to save a new one.
  create(input: PaymentIntentRequest): Promise<{ clientSecret: string; customerSessionClientSecret?: string }>;
  // Null when Stripe has no succeeded charge for this id.
  retrieveSucceeded(id: string): Promise<ConfirmedPayment | null>;
  // The latest declined attempt for this id; null when Stripe has none.
  retrieveFailure(id: string): Promise<FailedPaymentAttempt | null>;
};

export class PaymentsNotConfiguredError extends Error {}

export function createStripePayments(secretKey: string | undefined, customers?: StripeCustomerStore): PaymentIntentCreator {
  const stripe = secretKey ? new Stripe(secretKey) : null;

  // The shopper's Stripe customer, made the first time they check out.
  async function customerFor(client: Stripe, userId: string) {
    if (!customers) return null;
    const saved = await customers.find(userId);
    if (saved) return saved;
    const customer = await client.customers.create({ metadata: { userId } });
    await customers.save(userId, customer.id);
    return customer.id;
  }

  return {
    async create({ amountCents, userId }) {
      if (!stripe) throw new PaymentsNotConfiguredError("STRIPE_SECRET_KEY is not set.");

      const customer = await customerFor(stripe, userId);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: "usd",
        metadata: { userId },
        ...(customer ? { customer } : {}),
      });
      if (!paymentIntent.client_secret) {
        throw new Error("Stripe did not return a client secret.");
      }
      if (!customer) return { clientSecret: paymentIntent.client_secret };

      // Lets the card form list this shopper's saved cards and offer "save for next time".
      const session = await stripe.customerSessions.create({
        customer,
        components: {
          payment_element: {
            enabled: true,
            features: {
              payment_method_redisplay: "enabled",
              payment_method_save: "enabled",
              payment_method_save_usage: "on_session",
              payment_method_remove: "enabled",
            },
          },
        },
      });
      return { clientSecret: paymentIntent.client_secret, customerSessionClientSecret: session.client_secret };
    },

    async retrieveSucceeded(id) {
      if (!stripe) throw new PaymentsNotConfiguredError("STRIPE_SECRET_KEY is not set.");

      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(id);
        const userId = paymentIntent.metadata.userId;
        if (paymentIntent.status !== "succeeded" || !userId) return null;
        return { id: paymentIntent.id, amountCents: paymentIntent.amount, userId };
      } catch (error) {
        if (error instanceof Stripe.errors.StripeInvalidRequestError) return null;
        throw error;
      }
    },

    async retrieveFailure(id) {
      if (!stripe) throw new PaymentsNotConfiguredError("STRIPE_SECRET_KEY is not set.");

      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(id);
        const userId = paymentIntent.metadata.userId;
        const failure = paymentIntent.last_payment_error;
        if (!failure || !userId || paymentIntent.status === "succeeded") return null;
        return {
          id: paymentIntent.id,
          chargeId: typeof failure.charge === "string" ? failure.charge : null,
          amountCents: paymentIntent.amount,
          userId,
          failureCode: failure.code ?? null,
          declineCode: failure.decline_code ?? null,
          message: failure.message ?? "Your card was declined.",
        };
      } catch (error) {
        if (error instanceof Stripe.errors.StripeInvalidRequestError) return null;
        throw error;
      }
    },
  };
}
