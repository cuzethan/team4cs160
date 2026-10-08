import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SiteHeader } from "../components/SiteHeader";
import { products } from "../inventory/InventoryPage";
import { CartItemCard } from "./CartItemCard";
import { CartSummary } from "./CartSummary";
import type { CartItem } from "./types";

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
                deliveryStatus="Calculated at checkout"
              />
              <button type="button" onClick={handleCheckoutClick} disabled className="mt-6 w-full cursor-not-allowed rounded-xl bg-[#416449] px-5 py-3 font-bold text-white opacity-50">Checkout</button>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
