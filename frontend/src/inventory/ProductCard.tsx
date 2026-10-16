import { useState } from "react";
import type { InventoryProduct } from "./types";

// Managers restock in bulk, so the +/- buttons move stock by the typed amount.
// Returns null unless the text is a whole number from 1 up to Postgres' integer limit.
export function parseStockAmount(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const amount = Number(text);
  return amount >= 1 && amount <= 2147483647 ? amount : null;
}

type ProductCardProps = {
  product: InventoryProduct;
  onClick: (productId: string) => void;
  onAddToCart: (product: InventoryProduct, quantity: number) => void;
  isManager?: boolean;
  isUpdatingStock?: boolean;
  onAdjustStock?: (product: InventoryProduct, adjustment: number) => void;
};

export function ProductCard({
  product,
  onClick,
  onAddToCart,
  isManager = false,
  isUpdatingStock = false,
  onAdjustStock,
}: ProductCardProps) {
  const [amountText, setAmountText] = useState("1");
  const amount = parseStockAmount(amountText);
  const handleCardClick = () => onClick(product.id);
  const handleAddToCartClick = () => onAddToCart(product, 1);

  return (
    <article className="group overflow-hidden rounded-2xl border border-[#e8e7dc] bg-white shadow-[0_3px_12px_rgba(42,65,48,0.05)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(42,65,48,0.12)]">
      <button
        type="button"
        onClick={handleCardClick}
        className="block w-full cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-emerald-700"
        aria-label={`View details for ${product.name}`}
      >
        <div className="relative flex h-44 items-center justify-center bg-[#f3f5e9] text-7xl transition duration-200 group-hover:bg-[#edf2dd]">
          {/* Temporary placeholder; replace with the product image. */}
          <span aria-hidden="true">{product.emoji}</span>
          <span className="absolute left-3 top-3 rounded-full bg-white/85 px-3 py-1 text-xs font-semibold text-[#55705b]">
            {product.category}
          </span>
        </div>
        <div className="px-4 pb-2 pt-4">
          <h3 className="truncate text-base font-bold text-[#253b2d]">{product.name}</h3>
          <p className="mt-1 text-sm text-[#788078]">
            {product.quantityInStock} in stock
          </p>
        </div>
      </button>
      <div className="flex items-center justify-between px-4 pb-4 pt-2">
        <p className="font-bold text-[#253b2d]">
          ${product.price.toFixed(2)} <span className="text-xs font-medium text-[#788078]">/ {product.unit}</span>
        </p>
        <button
          type="button"
          onClick={handleAddToCartClick}
          disabled={product.quantityInStock === 0}
          className="rounded-full bg-[#e9f1df] px-3 py-2 text-xs font-bold text-[#416449] transition hover:bg-[#dce9cf] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`Add ${product.name} to cart`}
        >
          Add to cart
        </button>
      </div>
      {isManager && onAdjustStock && (
        <div className="flex items-center justify-between border-t border-[#eef0e8] px-4 py-3">
          <span className="text-xs font-semibold text-[#667269]">Manage stock</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => amount && onAdjustStock(product, -amount)}
              disabled={isUpdatingStock || !amount || amount > product.quantityInStock}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d9e2d2] text-base font-bold text-[#416449] hover:bg-[#f1f5eb] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={`Subtract ${amount ?? ""} ${product.unit} of ${product.name} from stock`}
            >
              −
            </button>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
              className="h-8 w-16 rounded-lg border border-[#d9e2d2] px-2 text-center text-sm text-[#253b2d] outline-none focus:border-[#416449]"
              aria-label={`Amount to add or subtract for ${product.name}`}
            />
            <button
              type="button"
              onClick={() => amount && onAdjustStock(product, amount)}
              disabled={isUpdatingStock || !amount}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d9e2d2] text-base font-bold text-[#416449] hover:bg-[#f1f5eb] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={`Add ${amount ?? ""} ${product.unit} of ${product.name} to stock`}
            >
              +
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
