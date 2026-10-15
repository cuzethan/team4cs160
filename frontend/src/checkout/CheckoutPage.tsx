import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { fetchCart, type CartLine } from "../cart/api";
import { deliveryFeeFor } from "../cart/delivery";
import { SiteHeader } from "../components/SiteHeader";
import { createPaymentIntent, fetchLatestCheckoutAddress, placeOrder, type CheckoutAddress } from "../orders/api";

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

const emptyAddress: CheckoutAddress = {
  street: "",
  city: "",
  state: "",
  zipCode: "",
  deliveryInstructions: "",
};

const inputClassName =
  "mt-1 w-full rounded-xl border border-[#dedfd5] bg-white px-4 py-3 text-sm text-[#253b2d] outline-none focus:border-[#416449]";

type CheckoutFormProps = {
  lines: CartLine[];
  address: CheckoutAddress;
  updateField: (field: keyof CheckoutAddress) => (value: string) => void;
  subtotal: number;
  totalWeight: number;
  deliveryFee: number;
  payment: ReactNode;
  submitError: string | null;
  isSubmitting: boolean;
  canSubmit: boolean;
  onSubmit: (event: FormEvent) => void;
};

function CheckoutForm({
  lines, address, updateField, subtotal, totalWeight, deliveryFee,
  payment, submitError, isSubmitting, canSubmit, onSubmit,
}: CheckoutFormProps) {
  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <section aria-labelledby="address-heading" className="rounded-2xl border border-[#e8e7dc] bg-white p-6">
          <h2 id="address-heading" className="text-xl font-extrabold">Delivery address</h2>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-6">
            <label className="text-sm font-semibold text-[#536459] sm:col-span-6">
              Street address
              <input required autoComplete="street-address" value={address.street} onChange={(event) => updateField("street")(event.target.value)} className={inputClassName} />
            </label>
            <label className="text-sm font-semibold text-[#536459] sm:col-span-3">
              City
              <input required autoComplete="address-level2" value={address.city} onChange={(event) => updateField("city")(event.target.value)} className={inputClassName} />
            </label>
            <label className="text-sm font-semibold text-[#536459] sm:col-span-1">
              State
              <input required autoComplete="address-level1" value={address.state} onChange={(event) => updateField("state")(event.target.value)} className={inputClassName} />
            </label>
            <label className="text-sm font-semibold text-[#536459] sm:col-span-2">
              ZIP code
              <input required autoComplete="postal-code" inputMode="numeric" pattern="\d{5}(-\d{4})?" title="5-digit ZIP code" value={address.zipCode} onChange={(event) => updateField("zipCode")(event.target.value)} className={inputClassName} />
            </label>
            <label className="text-sm font-semibold text-[#536459] sm:col-span-6">
              Drop-off instructions <span className="font-normal text-[#899188]">(optional)</span>
              <textarea rows={2} placeholder="Front door by default" value={address.deliveryInstructions} onChange={(event) => updateField("deliveryInstructions")(event.target.value)} className={inputClassName} />
            </label>
          </div>
        </section>

        <section aria-labelledby="payment-heading" className="rounded-2xl border border-[#e8e7dc] bg-white p-6">
          <h2 id="payment-heading" className="text-xl font-extrabold">Payment</h2>
          {payment}
        </section>
      </div>

      <aside className="rounded-2xl border border-[#e8e7dc] bg-white p-6 shadow-[0_3px_12px_rgba(42,65,48,0.04)]">
        <h2 className="text-xl font-extrabold">Order summary</h2>
        <ul className="mt-5 space-y-2 border-b border-[#ecebe2] pb-4 text-sm text-[#5f6b61]">
          {lines.map((line) => (
            <li key={line.cartItemId} className="flex justify-between gap-4">
              <span>{line.name} <span className="text-[#899188]">× {line.quantity}</span></span>
              <span className="shrink-0">${(line.price * line.quantity).toFixed(2)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-[#667269]">Subtotal</dt>
            <dd className="font-bold">${subtotal.toFixed(2)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[#667269]">Total weight</dt>
            <dd className="font-bold">{totalWeight.toFixed(1)} lb</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[#667269]">Delivery fee</dt>
            <dd className="font-bold">{deliveryFee === 0 ? "Free" : `$${deliveryFee.toFixed(2)}`}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-[#ecebe2] pt-3 text-base">
            <dt className="font-bold">Total</dt>
            <dd className="font-extrabold">${(subtotal + deliveryFee).toFixed(2)}</dd>
          </div>
        </dl>
        {submitError && (
          <p role="alert" className="mt-4 rounded-xl border border-red-200 px-4 py-3 text-sm text-red-800">{submitError}</p>
        )}
        <button
          type="submit"
          disabled={!canSubmit || isSubmitting}
          className="mt-6 w-full rounded-xl bg-[#416449] px-5 py-3 font-bold text-white transition cursor-pointer hover:bg-[#35563c] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Placing order…" : "Place order"}
        </button>
      </aside>
    </form>
  );
}

function PayableCheckout(props: Omit<CheckoutFormProps, "payment" | "submitError" | "isSubmitting" | "canSubmit" | "onSubmit">) {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) return;

    setSubmitError(null);
    setIsSubmitting(true);
    const result = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: { return_url: `${window.location.origin}/orders` },
    });
    if (result.error) {
      // Validation errors are already shown under the card field.
      if (result.error.type !== "validation_error") {
        setSubmitError(result.error.message ?? "Your card could not be charged.");
      }
      setIsSubmitting(false);
      return;
    }
    if (result.paymentIntent.status !== "succeeded") {
      setSubmitError("Your payment could not be completed.");
      setIsSubmitting(false);
      return;
    }

    try {
      const order = await placeOrder(props.address, result.paymentIntent.id);
      navigate("/orders", { state: { placedOrderId: order.id } });
    } catch (error) {
      setSubmitError(`${(error as Error).message} Your card was charged, so please don't try again.`);
      setIsSubmitting(false);
    }
  };

  return (
    <CheckoutForm
      {...props}
      payment={<div className="mt-4"><PaymentElement /></div>}
      submitError={submitError}
      isSubmitting={isSubmitting}
      canSubmit={Boolean(stripe && elements)}
      onSubmit={handleSubmit}
    />
  );
}

export function CheckoutPage() {
  const { user, loading: authLoading } = useAuth();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [address, setAddress] = useState<CheckoutAddress>(emptyAddress);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);

  const loadPaymentIntent = async () => {
    setPaymentLoading(true);
    setPaymentError(null);
    setClientSecret(null);
    try {
      setClientSecret(await createPaymentIntent());
    } catch (error) {
      setPaymentError((error as Error).message);
    } finally {
      setPaymentLoading(false);
    }
  };

  const loadCart = async () => {
    setIsLoading(true);
    setLoadError(null);
    setClientSecret(null);
    setPaymentError(null);
    try {
      const [cartLines, savedAddress] = await Promise.all([
        fetchCart(),
        fetchLatestCheckoutAddress(),
      ]);
      setLines(cartLines);
      if (savedAddress) setAddress(savedAddress);
      if (cartLines.length > 0) void loadPaymentIntent();
    } catch (error) {
      setLoadError((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) void loadCart();
  }, [user]);

  const updateField = (field: keyof CheckoutAddress) => (value: string) =>
    setAddress((current) => ({ ...current, [field]: value }));

  const subtotal = lines.reduce((total, line) => total + line.price * line.quantity, 0);
  const totalWeight = lines.reduce((total, line) => total + line.weightLbs * line.quantity, 0);
  const deliveryFee = deliveryFeeFor(totalWeight);

  return (
    <div className="min-h-screen bg-[#fbfaf5] text-[#253b2d]">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
        <div className="mb-8">
          <Link to="/cart" className="text-sm font-bold text-[#416449] underline-offset-4 hover:underline">← Back to cart</Link>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-[#294332] sm:text-5xl">Checkout</h1>
        </div>

        {authLoading || (user && isLoading) ? (
          <p role="status" className="rounded-2xl bg-white p-6 text-[#5f6b61]">Loading checkout…</p>
        ) : !user ? (
          <section className="rounded-2xl border border-[#e8e7dc] bg-white p-8 text-center">
            <p className="text-lg font-bold">Log in to check out</p>
            <Link to="/customer-login" className="mt-4 inline-block font-bold text-[#416449] underline">Customer login</Link>
          </section>
        ) : loadError ? (
          <section role="alert" className="rounded-2xl border border-red-200 bg-white p-6">
            <p className="text-red-800">{loadError}</p>
            <button type="button" onClick={() => void loadCart()} className="mt-4 font-bold text-[#416449] underline">Try again</button>
          </section>
        ) : lines.length === 0 ? (
          <section className="rounded-2xl border border-[#e8e7dc] bg-white p-8 text-center">
            <p className="text-lg font-bold">Your cart is empty</p>
            <Link to="/inventory" className="mt-4 inline-block font-bold text-[#416449] underline">Browse groceries</Link>
          </section>
        ) : clientSecret ? (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: { theme: "stripe", variables: { colorPrimary: "#416449", borderRadius: "12px" } },
            }}
          >
            <PayableCheckout
              lines={lines}
              address={address}
              updateField={updateField}
              subtotal={subtotal}
              totalWeight={totalWeight}
              deliveryFee={deliveryFee}
            />
          </Elements>
        ) : (
          <CheckoutForm
            lines={lines}
            address={address}
            updateField={updateField}
            subtotal={subtotal}
            totalWeight={totalWeight}
            deliveryFee={deliveryFee}
            payment={
              !publishableKey ? (
                <p role="alert" className="mt-4 text-sm text-red-800">Card payments are not configured.</p>
              ) : paymentLoading ? (
                <p role="status" className="mt-4 text-sm text-[#667269]">Loading payment…</p>
              ) : paymentError ? (
                <div role="alert" className="mt-4">
                  <p className="text-sm text-red-800">{paymentError}</p>
                  <button type="button" onClick={() => void loadPaymentIntent()} className="mt-3 font-bold text-[#416449] underline">Try again</button>
                </div>
              ) : null
            }
            submitError={null}
            isSubmitting={false}
            canSubmit={false}
            onSubmit={(event) => event.preventDefault()}
          />
        )}
      </main>
    </div>
  );
}
