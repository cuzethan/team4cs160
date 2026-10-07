import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SiteHeader } from "../components/SiteHeader";
import { products } from "../inventory/InventoryPage";
import type { InventoryProduct } from "../inventory/types";

type CartItem = InventoryProduct & {
  cartItemId: string;
  quantity: number;
  weightLbs: number;
};

const mockCartItems: CartItem[] = [
  {
    ...products.find((product) => product.id === "apple-gala")!,
    cartItemId: "cart-apple-gala",
    quantity: 2,
    weightLbs: 1,
  },
  {
    ...products.find((product) => product.id === "avocado")!,
    cartItemId: "cart-avocado",
    quantity: 3,
    weightLbs: 0.4,
  },
  {
    ...products.find((product) => product.id === "bread")!,
    cartItemId: "cart-bread",
    quantity: 1,
    weightLbs: 1.2,
  },
];

export function CartPage() {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCartItems = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Replace this mock with GET /api/cart when the cart API is available.
      setCartItems(mockCartItems.map((item) => ({ ...item })));
    } catch {
      setError("We couldn't load your cart. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchCartItems();
  }, []);

  const handleIncreaseQuantity = (cartItemId: string) => {
    setCartItems((items) =>
      items.map((item) =>
        item.cartItemId === cartItemId
          ? { ...item, quantity: Math.min(item.quantity + 1, item.quantityInStock) }
          : item,
      ),
    );
  };

  const handleDecreaseQuantity = (cartItemId: string) => {
    setCartItems((items) =>
      items
        .map((item) =>
          item.cartItemId === cartItemId
            ? { ...item, quantity: item.quantity - 1 }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  const handleRemoveItem = (cartItemId: string) => {
    setCartItems((items) => items.filter((item) => item.cartItemId !== cartItemId));
  };

  const handleCheckoutClick = () => {
    // Checkout stays disabled until order submission is implemented.
  };

  const calculateTotalPrice = () =>
    cartItems.reduce((total, item) => total + item.price * item.quantity, 0);

  const calculateTotalWeight = () =>
    cartItems.reduce((total, item) => total + item.weightLbs * item.quantity, 0);

  return (
    <div className="min-h-screen bg-[#fbfaf5] text-[#253b2d]">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
        <div className="mb-8">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#7d887b]">Your groceries</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-[#294332] sm:text-5xl">Shopping cart</h1>
        </div>

        {isLoading ? (
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
              {cartItems.map((item) => (
                <article key={item.cartItemId} className="flex flex-col gap-4 rounded-2xl border border-[#e8e7dc] bg-white p-5 shadow-[0_3px_12px_rgba(42,65,48,0.04)] sm:flex-row sm:items-center">
                  <span aria-hidden="true" className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-[#f3f5e9] text-4xl">{item.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-bold">{item.name}</h2>
                    <p className="mt-1 text-sm text-[#788078]">${item.price.toFixed(2)} / {item.unit}</p>
                    <p className="mt-1 text-sm text-[#788078]">{(item.weightLbs * item.quantity).toFixed(1)} lb total</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => handleDecreaseQuantity(item.cartItemId)} aria-label={`Decrease ${item.name} quantity`} className="flex h-9 w-9 items-center justify-center rounded-full border border-[#dce2d5] font-bold hover:bg-[#f3f5e9]">−</button>
                    <span aria-label={`Quantity ${item.quantity}`} className="min-w-6 text-center font-bold">{item.quantity}</span>
                    <button type="button" onClick={() => handleIncreaseQuantity(item.cartItemId)} disabled={item.quantity >= item.quantityInStock} aria-label={`Increase ${item.name} quantity`} className="flex h-9 w-9 items-center justify-center rounded-full border border-[#dce2d5] font-bold hover:bg-[#f3f5e9] disabled:cursor-not-allowed disabled:opacity-40">+</button>
                  </div>
                  <p className="min-w-20 text-right font-extrabold">${(item.price * item.quantity).toFixed(2)}</p>
                  <button type="button" onClick={() => handleRemoveItem(item.cartItemId)} className="text-left text-sm font-bold text-[#8b5145] underline sm:text-center">Remove</button>
                </article>
              ))}
            </section>

            <aside aria-labelledby="cart-summary-heading" className="rounded-2xl border border-[#e8e7dc] bg-white p-6 shadow-[0_3px_12px_rgba(42,65,48,0.04)]">
              <h2 id="cart-summary-heading" className="text-xl font-extrabold">Order summary</h2>
              <dl className="mt-5 space-y-4">
                <div className="flex justify-between gap-4"><dt className="text-[#667269]">Total price</dt><dd className="font-bold">${calculateTotalPrice().toFixed(2)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-[#667269]">Total weight</dt><dd className="font-bold">{calculateTotalWeight().toFixed(1)} lb</dd></div>
                <div className="border-t border-[#ecebe2] pt-4"><dt className="text-sm font-bold text-[#55705b]">Delivery fee</dt><dd className="mt-1 text-sm text-[#667269]">Calculated at checkout</dd></div>
              </dl>
              <button type="button" onClick={handleCheckoutClick} disabled className="mt-6 w-full cursor-not-allowed rounded-xl bg-[#416449] px-5 py-3 font-bold text-white opacity-50">Checkout</button>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
