import { beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for the Stripe client so these tests never call Stripe.
const stripe = vi.hoisted(() => {
  class StripeInvalidRequestError extends Error {}
  const api = {
    customers: { create: vi.fn() },
    paymentIntents: { create: vi.fn(), retrieve: vi.fn() },
    customerSessions: { create: vi.fn() },
  };
  function Stripe() {
    return api;
  }
  Stripe.errors = { StripeInvalidRequestError };
  return { api, Stripe, StripeInvalidRequestError };
});
vi.mock("stripe", () => ({ default: stripe.Stripe }));

import { createStripePayments, PaymentsNotConfiguredError, type StripeCustomerStore } from "../src/payments.js";

function customerStore(saved: string | null = null) {
  return { find: vi.fn(async () => saved), save: vi.fn(async () => {}) } satisfies StripeCustomerStore;
}

beforeEach(() => {
  vi.clearAllMocks();
  stripe.api.paymentIntents.create.mockResolvedValue({ client_secret: "pi_secret" });
  stripe.api.customers.create.mockResolvedValue({ id: "cus_new" });
  stripe.api.customerSessions.create.mockResolvedValue({ client_secret: "session_secret" });
});

describe("Stripe payments", () => {
  it("needs a secret key", async () => {
    const payments = createStripePayments(undefined);
    await expect(payments.create({ amountCents: 100, userId: "u1" })).rejects.toBeInstanceOf(PaymentsNotConfiguredError);
    await expect(payments.retrieveSucceeded("pi_1")).rejects.toBeInstanceOf(PaymentsNotConfiguredError);
    await expect(payments.retrieveFailure("pi_1")).rejects.toBeInstanceOf(PaymentsNotConfiguredError);
  });

  it("charges the cart total without saved cards when there's no customer store", async () => {
    const result = await createStripePayments("sk_test").create({ amountCents: 897, userId: "u1" });

    expect(result).toEqual({ clientSecret: "pi_secret" });
    expect(stripe.api.paymentIntents.create).toHaveBeenCalledWith({ amount: 897, currency: "usd", metadata: { userId: "u1" } });
    expect(stripe.api.customerSessions.create).not.toHaveBeenCalled();
  });

  it("creates a Stripe customer the first time so cards can be saved", async () => {
    const customers = customerStore();

    const result = await createStripePayments("sk_test", customers).create({ amountCents: 500, userId: "u1" });

    expect(stripe.api.customers.create).toHaveBeenCalledWith({ metadata: { userId: "u1" } });
    expect(customers.save).toHaveBeenCalledWith("u1", "cus_new");
    expect(stripe.api.paymentIntents.create).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_new" }));
    expect(stripe.api.customerSessions.create.mock.calls[0][0].components.payment_element.features).toMatchObject({
      payment_method_redisplay: "enabled",
      payment_method_save: "enabled",
    });
    expect(result).toEqual({ clientSecret: "pi_secret", customerSessionClientSecret: "session_secret" });
  });

  it("reuses the shopper's saved Stripe customer", async () => {
    const customers = customerStore("cus_saved");
    await createStripePayments("sk_test", customers).create({ amountCents: 500, userId: "u1" });
    expect(stripe.api.customers.create).not.toHaveBeenCalled();
    expect(stripe.api.paymentIntents.create).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_saved" }));
  });

  it("fails if Stripe returns no client secret", async () => {
    stripe.api.paymentIntents.create.mockResolvedValue({ client_secret: null });
    await expect(createStripePayments("sk_test").create({ amountCents: 1, userId: "u1" })).rejects.toThrow("client secret");
  });

  it("confirms only succeeded payments tagged with a shopper", async () => {
    const payments = createStripePayments("sk_test");
    stripe.api.paymentIntents.retrieve.mockResolvedValueOnce({ id: "pi_1", status: "succeeded", amount: 897, metadata: { userId: "u1" } });
    await expect(payments.retrieveSucceeded("pi_1")).resolves.toEqual({ id: "pi_1", amountCents: 897, userId: "u1" });

    stripe.api.paymentIntents.retrieve.mockResolvedValueOnce({ id: "pi_2", status: "requires_payment_method", amount: 897, metadata: { userId: "u1" } });
    await expect(payments.retrieveSucceeded("pi_2")).resolves.toBeNull();

    stripe.api.paymentIntents.retrieve.mockResolvedValueOnce({ id: "pi_3", status: "succeeded", amount: 897, metadata: {} });
    await expect(payments.retrieveSucceeded("pi_3")).resolves.toBeNull();
  });

  it("reads the decline reason from a failed payment", async () => {
    const payments = createStripePayments("sk_test");
    stripe.api.paymentIntents.retrieve.mockResolvedValueOnce({
      id: "pi_1", status: "requires_payment_method", amount: 897, metadata: { userId: "u1" },
      last_payment_error: { charge: "ch_1", code: "card_declined", decline_code: "insufficient_funds", message: "Insufficient funds." },
    });
    await expect(payments.retrieveFailure("pi_1")).resolves.toEqual({
      id: "pi_1", chargeId: "ch_1", amountCents: 897, userId: "u1",
      failureCode: "card_declined", declineCode: "insufficient_funds", message: "Insufficient funds.",
    });

    stripe.api.paymentIntents.retrieve.mockResolvedValueOnce({
      id: "pi_2", status: "requires_payment_method", amount: 100, metadata: { userId: "u1" }, last_payment_error: {},
    });
    await expect(payments.retrieveFailure("pi_2")).resolves.toMatchObject({ chargeId: null, failureCode: null, declineCode: null, message: "Your card was declined." });

    stripe.api.paymentIntents.retrieve.mockResolvedValueOnce({ id: "pi_3", status: "succeeded", amount: 1, metadata: { userId: "u1" }, last_payment_error: {} });
    await expect(payments.retrieveFailure("pi_3")).resolves.toBeNull();
  });

  it("treats an unknown payment id as not found but passes on other errors", async () => {
    const payments = createStripePayments("sk_test");
    stripe.api.paymentIntents.retrieve.mockRejectedValue(new stripe.StripeInvalidRequestError("No such payment_intent"));
    await expect(payments.retrieveSucceeded("bad")).resolves.toBeNull();
    await expect(payments.retrieveFailure("bad")).resolves.toBeNull();

    stripe.api.paymentIntents.retrieve.mockRejectedValue(new Error("network"));
    await expect(payments.retrieveSucceeded("pi_1")).rejects.toThrow("network");
    await expect(payments.retrieveFailure("pi_1")).rejects.toThrow("network");
  });
});
