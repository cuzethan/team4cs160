import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { InventoryProduct } from "../inventory/types";
import { addToCart } from "./api";

type Notice =
  | { tone: "success"; productId: string; productName: string; quantity: number }
  | { tone: "error"; text: string };

// Shared "Add to cart" behavior for product cards and the product detail dialog.
// Sends logged-out shoppers to the customer login first.
export function useAddToCart() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  const handleAddToCart = async (product: InventoryProduct, quantity: number) => {
    if (!user) {
      navigate("/customer-login");
      return;
    }
    try {
      await addToCart(product.id, quantity);
      setNotice((current) =>
        current?.tone === "success" && current.productId === product.id
          ? { ...current, quantity: current.quantity + quantity }
          : { tone: "success", productId: product.id, productName: product.name, quantity },
      );
    } catch (error) {
      setNotice({ tone: "error", text: (error as Error).message });
    }
  };

  const noticeElement = notice && (
    <p
      role="status"
      className={`fixed bottom-6 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl px-5 py-3 text-sm font-semibold shadow-lg ${notice.tone === "success" ? "bg-[#416449] text-white" : "bg-white text-red-800 ring-1 ring-red-200"}`}
    >
      {notice.tone === "success"
        ? `Added ${notice.quantity} × ${notice.productName} to your cart.`
        : notice.text}
    </p>
  );

  return { handleAddToCart, noticeElement };
}
