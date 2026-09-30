import type { InventoryProduct } from "./types";

type ProductDetailPageProps = {
  product: InventoryProduct;
  onClose: () => void;
};

export function ProductDetailPage({ product, onClose }: ProductDetailPageProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1c2c20]/55 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-detail-title"
        className="relative grid w-full max-w-3xl overflow-hidden rounded-3xl bg-[#fffefa] shadow-2xl md:grid-cols-2"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-xl text-[#536459] shadow-sm transition hover:bg-white hover:text-[#253b2d]"
          aria-label="Close product details"
        >
          ×
        </button>

        <div className="flex min-h-64 items-center justify-center bg-[#f1f4e6] text-9xl md:min-h-[28rem]">
          {/* Temporary placeholder; replace with the product image. */}
          <span aria-hidden="true">{product.emoji}</span>
        </div>

        <div className="flex flex-col p-7 md:p-9">
          <span className="w-fit rounded-full bg-[#e9f1df] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#55705b]">
            {product.category}
          </span>
          <h2 id="product-detail-title" className="mt-4 text-3xl font-bold tracking-tight text-[#253b2d]">
            {product.name}
          </h2>
          <p className="mt-3 text-2xl font-bold text-[#42674a]">
            ${product.price.toFixed(2)} <span className="text-sm font-medium text-[#788078]">/ {product.unit}</span>
          </p>
          <p className="mt-5 leading-7 text-[#69756b]">{product.description}</p>
          <p className="mt-5 text-sm font-semibold text-[#536459]">
            {product.quantityInStock} {product.unit === "each" ? "available" : "in stock"}
          </p>

          <div className="mt-auto flex flex-col gap-3 pt-8 sm:flex-row">
            <label className="flex items-center justify-between gap-3 rounded-xl border border-[#dedfd5] px-4 py-3 text-sm font-semibold text-[#536459]">
              Quantity
              <select
                aria-label="Quantity"
                defaultValue="1"
                className="bg-transparent font-bold text-[#253b2d] outline-none"
              >
                <option value="1">1</option>
              </select>
            </label>
            <button
              type="button"
              className="flex-1 rounded-xl bg-[#416449] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#35563c]"
            >
              Add to cart
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
