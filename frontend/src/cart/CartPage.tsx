import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { SiteHeader } from "../components/SiteHeader";
import { fetchCart, removeCartItem, updateCartItem, type CartLine } from "./api";
import { CartItemCard } from "./CartItemCard";
import { CartSummary } from "./CartSummary";
import { deliveryFeeFor } from "./delivery";
import { fetchDeliverySettings, type DeliverySettings } from "../manager/api";
import { toCartItem, type CartItem } from "./types";

export function CartPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Problems with a single change (e.g. not enough stock). The cart itself still shows.
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [deliverySettings, setDeliverySettings] = useState<DeliverySettings>({ deliveryFee: 10, freeDeliveryWeightThreshold: 20 });

  const showCart = (lines: CartLine[]) => {
    setCartItems(lines.map(toCartItem));
  };

  const fetchCartItems = async () => {
    setIsLoading(true);
    setError(null);
    try {
      showCart(await fetchCart());
    } catch (fetchError) {
      setError((fetchError as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) void fetchCartItems();
  }, [user]);

  useEffect(() => { void fetchDeliverySettings().then(setDeliverySettings).catch(() => {}); }, []);

  const changeCart = async (change: () => Promise<CartLine[]>) => {
    setUpdateError(null);
    try {
      showCart(await change());
    } catch (changeError) {
      setUpdateError((changeError as Error).message);
    }
  };

  const findItem = (cartItemId: string) => cartItems.find((item) => item.cartItemId === cartItemId);

  const handleIncreaseQuantity = (cartItemId: string) => {
    const item = findItem(cartItemId);
    if (item) void changeCart(() => updateCartItem(item.id, item.quantity + 1));
  };

  const handleDecreaseQuantity = (cartItemId: string) => {
    const item = findItem(cartItemId);
    if (!item) return;
    void changeCart(() =>
      item.quantity > 1 ? updateCartItem(item.id, item.quantity - 1) : removeCartItem(item.id),
    );
  };

  const handleRemoveItem = (cartItemId: string) => {
    const item = findItem(cartItemId);
    if (item) void changeCart(() => removeCartItem(item.id));
  };

  const handleCheckoutClick = () => {
    navigate("/checkout");
  };

  const calculateTotalPrice = () =>
    cartItems.reduce((total, item) => total + item.price * item.quantity, 0);

  const calculateTotalWeight = () =>
    cartItems.reduce((total, item) => total + item.weightLbs * item.quantity, 0);

  const deliveryFee = deliveryFeeFor(calculateTotalWeight(), deliverySettings);

  return (
    <div className="min-h-screen bg-[#fbfaf5] text-[#253b2d]">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
        <div className="mb-8">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#7d887b]">Your groceries</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-[#294332] sm:text-5xl">Shopping cart</h1>
        </div>

        {authLoading ? (
          <p role="status" className="rounded-2xl bg-white p-6 text-[#5f6b61]">Loading your cart…</p>
        ) : !user ? (
          <section className="rounded-2xl border border-[#e8e7dc] bg-white p-8 text-center">
            <p className="text-lg font-bold">Log in to see your cart</p>
            <Link to="/customer-login" className="mt-4 inline-block font-bold text-[#416449] underline">Customer login</Link>
          </section>
        ) : isLoading ? (
          <p role="status" className="rounded-2xl bg-white p-6 text-[#5f6b61]">Loading your cart…</p>
        ) : error ? (
          <section role="alert" className="rounded-2xl border border-red-200 bg-white p-6">
            <p className="text-red-800">{error}</p>
            <button type="button" onClick={() => void fetchCartItems()} className="mt-4 font-bold text-[#416449] underline">Try again</button>
          </section>
        ) : cartItems.length === 0 ? (
          <section className="rounded-2xl border border-[#e8e7dc] bg-white p-8 text-center">
            <p className="text-lg font-bold">Your cart is empty</p>
            <Link to="/inventory" className="mt-4 inline-block font-bold text-[#416449] underline">Browse groceries</Link>
          </section>
        ) : (
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section aria-label="Cart items" className="space-y-4">
              {updateError && (
                <p role="alert" className="rounded-xl border border-red-200 bg-white px-4 py-3 text-sm text-red-800">{updateError}</p>
              )}
              {cartItems.map((item) => (
                <CartItemCard
                  key={item.cartItemId}
                  item={item}
                  onIncrease={handleIncreaseQuantity}
                  onDecrease={handleDecreaseQuantity}
                  onRemove={handleRemoveItem}
                />
              ))}
            </section>

            <aside className="rounded-2xl border border-[#e8e7dc] bg-white p-6 shadow-[0_3px_12px_rgba(42,65,48,0.04)]">
              <CartSummary
                totalPrice={calculateTotalPrice()}
                totalWeight={calculateTotalWeight()}
                deliveryStatus={deliveryFee === 0 ? "Free" : `$${deliveryFee.toFixed(2)}`}
              />
              <button type="button" onClick={handleCheckoutClick} className="mt-6 w-full rounded-xl bg-[#416449] px-5 py-3 font-bold text-white transition hover:bg-[#35563c]">Checkout</button>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
