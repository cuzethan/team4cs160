import Stripe from "stripe";

export type PaymentIntentRequest = {
  amountCents: number;
  userId: string;
};

// The bit of Stripe the checkout route needs. Tests pass a fake instead of calling Stripe.
export type PaymentIntentCreator = {
  create(input: PaymentIntentRequest): Promise<{ clientSecret: string }>;
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
  };
}
