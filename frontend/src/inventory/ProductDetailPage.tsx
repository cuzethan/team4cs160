import { useState } from "react";
import type { InventoryProduct } from "./types";

type ProductDetailPageProps = {
  product: InventoryProduct;
  onClose: () => void;
  onAddToCart: (product: InventoryProduct, quantity: number) => void;
};

export function ProductDetailPage({ product, onClose, onAddToCart }: ProductDetailPageProps) {
  const [quantity, setQuantity] = useState(1);
  const quantityChoices = Array.from(
    { length: product.quantityInStock },
    (_, index) => index + 1,
  );

  const handleAddToCartClick = () => {
    onAddToCart(product, quantity);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/55 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-detail-title"
        className="relative grid w-full max-w-3xl overflow-hidden rounded-3xl bg-surface shadow-2xl md:grid-cols-2"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-xl text-muted shadow-sm transition hover:bg-white hover:text-ink"
          aria-label="Close product details"
        >
          ×
        </button>

        <div className="flex min-h-64 items-center justify-center bg-canvas text-9xl md:min-h-[28rem]">
          {/* Temporary placeholder; replace with the product image. */}
          <span aria-hidden="true">{product.emoji}</span>
        </div>

        <div className="flex flex-col p-7 md:p-9">
          <span className="w-fit rounded-full bg-accent-soft px-3 py-1 text-xs font-bold uppercase tracking-wide text-muted">
            {product.category}
          </span>
          <h2 id="product-detail-title" className="mt-4 text-3xl font-bold tracking-tight text-ink">
            {product.name}
          </h2>
          <p className="mt-3 text-2xl font-bold text-accent-ink">
            ${product.price.toFixed(2)} <span className="text-sm font-medium text-muted">/ {product.unit}</span>
          </p>
          <p className="mt-5 leading-7 text-muted">{product.description}</p>
          {product.quantityInStock === 0 ? (
            <p className="mt-5 text-sm font-bold text-red-700">Out of stock</p>
          ) : (
            <p className="mt-5 text-sm font-semibold text-muted">
              {product.quantityInStock} {product.unit === "each" ? "available" : "in stock"}
            </p>
          )}

          <div className="mt-auto flex flex-col gap-3 pt-8 sm:flex-row">
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-muted">
              Quantity
              <select
                aria-label="Quantity"
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
                className="bg-transparent font-bold text-ink outline-none"
              >
                {quantityChoices.map((choice) => (
                  <option key={choice} value={choice}>{choice}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={handleAddToCartClick}
              disabled={product.quantityInStock === 0}
              className="flex-1 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-on-accent transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add to cart
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
