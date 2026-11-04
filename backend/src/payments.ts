import Stripe from "stripe";

export type PaymentIntentRequest = {
  amountCents: number;
  userId: string;
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
  create(input: PaymentIntentRequest): Promise<{ clientSecret: string }>;
  // Null when Stripe has no succeeded charge for this id.
  retrieveSucceeded(id: string): Promise<ConfirmedPayment | null>;
  // The latest declined attempt for this id; null when Stripe has none.
  retrieveFailure(id: string): Promise<FailedPaymentAttempt | null>;
};

export class PaymentsNotConfiguredError extends Error {}

export function createStripePayments(secretKey: string | undefined): PaymentIntentCreator {
  const stripe = secretKey ? new Stripe(secretKey) : null;

  return {
    async create({ amountCents, userId }) {
      if (!stripe) throw new PaymentsNotConfiguredError("STRIPE_SECRET_KEY is not set.");

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: "usd",
        metadata: { userId },
      });
      if (!paymentIntent.client_secret) {
        throw new Error("Stripe did not return a client secret.");
      }
      return { clientSecret: paymentIntent.client_secret };
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
