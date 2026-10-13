import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { fetchCart, type CartLine } from "../cart/api";
import { deliveryFeeFor } from "../cart/delivery";
import { SiteHeader } from "../components/SiteHeader";
import { placeOrder, type CheckoutAddress } from "../orders/api";

const emptyAddress: CheckoutAddress = {
  street: "",
  city: "",
  state: "",
  zipCode: "",
  deliveryInstructions: "",
};

const inputClassName =
  "mt-1 w-full rounded-xl border border-[#dedfd5] bg-white px-4 py-3 text-sm text-[#253b2d] outline-none focus:border-[#416449]";

export function CheckoutPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [address, setAddress] = useState<CheckoutAddress>(emptyAddress);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadCart = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      setLines(await fetchCart());
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

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const order = await placeOrder(address);
      navigate("/orders", { state: { placedOrderId: order.id } });
    } catch (error) {
      setSubmitError((error as Error).message);
      setIsSubmitting(false);
    }
  };

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
        ) : (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
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
                <p className="mt-2 text-sm text-[#667269]">
                  Payment is simulated for now. No card details are needed, and your order is marked paid when you place it.
                </p>
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
                disabled={isSubmitting}
                className="mt-6 w-full rounded-xl bg-[#416449] px-5 py-3 font-bold text-white transition hover:bg-[#35563c] disabled:cursor-wait disabled:opacity-60"
              >
                {isSubmitting ? "Placing order…" : "Place order"}
              </button>
            </aside>
          </form>
        )}
      </main>
    </div>
  );
}
