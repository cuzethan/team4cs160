import type { InventoryProduct } from "./types";

type ProductCardProps = {
  product: InventoryProduct;
  onClick: (productId: string) => void;
  onAddToCart: (product: InventoryProduct, quantity: number) => void;
};

export function ProductCard({ product, onClick }: ProductCardProps) {
  const handleCardClick = () => onClick(product.id);

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
          className="rounded-full bg-[#e9f1df] px-3 py-2 text-xs font-bold text-[#416449] transition hover:bg-[#dce9cf]"
          aria-label={`Add ${product.name} to cart`}
        >
          Add to cart
        </button>
      </div>
    </article>
  );
}
