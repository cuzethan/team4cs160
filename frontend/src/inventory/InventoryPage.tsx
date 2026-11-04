import { useState } from "react";
import { useAddToCart } from "../cart/useAddToCart";
import { SiteHeader } from "../components/SiteHeader";
import { useAuth } from "../auth/AuthContext";
import { adjustProductStock } from "./api";
import { ProductCard } from "./ProductCard";
import { ProductDetailPage } from "./ProductDetailPage";
import type { InventoryProduct } from "./types";
import { useProducts } from "./useProducts";

const ALL_CATEGORIES = "All groceries";

function CategorySidebar({
  products,
  selected,
  onSelect,
}: {
  products: InventoryProduct[];
  selected: string;
  onSelect: (category: string) => void;
}) {
  const categoryNames = [...new Set(products.map((product) => product.category))].sort();
  const categories = [
    { name: ALL_CATEGORIES, count: products.length },
    ...categoryNames.map((name) => ({
      name,
      count: products.filter((product) => product.category === name).length,
    })),
  ];

  return (
    <aside className="rounded-2xl border border-border bg-white p-5 shadow-[0_3px_12px_rgba(0,0,0,0.06)]">
      <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-muted">
        Shop by category
      </h2>
      <ul className="mt-4 space-y-1">
        {categories.map((category) => (
          <li key={category.name}>
            <button
              type="button"
              onClick={() => onSelect(category.name)}
              aria-pressed={category.name === selected}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${category.name === selected ? "bg-accent-soft font-bold text-accent-ink" : "font-medium text-muted hover:bg-canvas"}`}
            >
              <span>{category.name}</span>
              <span className="text-xs text-muted">{category.count}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function InventorySearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex h-12 flex-1 items-center gap-3 rounded-xl border border-border bg-white px-4 text-muted shadow-sm">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-5 w-5 fill-none stroke-current"
        strokeWidth="1.8"
      >
        <circle cx="10.8" cy="10.8" r="6.5" />
        <path d="m16 16 4.5 4.5" />
      </svg>
      <input
        type="search"
        placeholder="Search for fresh groceries..."
        aria-label="Search groceries"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
      />
    </label>
  );
}

type SortOption = "featured" | "price-low" | "price-high";

function SortControl({
  value,
  onChange,
}: {
  value: SortOption;
  onChange: (value: SortOption) => void;
}) {
  return (
    <label className="flex h-12 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm text-muted shadow-sm">
      <span className="whitespace-nowrap">Sort by</span>
      <select
        aria-label="Sort products"
        value={value}
        onChange={(event) => onChange(event.target.value as SortOption)}
        className="max-w-36 bg-transparent font-semibold text-ink outline-none"
      >
        <option value="featured">Featured</option>
        <option value="price-low">Price: low to high</option>
        <option value="price-high">Price: high to low</option>
      </select>
    </label>
  );
}

export function InventoryPage() {
  const { products, isLoading, error, reload, updateStockQuantity } = useProducts();
  const { user, loading: authLoading } = useAuth();
  const isManager = !authLoading && user?.role === "manager";
  const [selectedProduct, setSelectedProduct] =
    useState<InventoryProduct | null>(null);
  const [sortOption, setSortOption] = useState<SortOption>("featured");
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORIES);
  const [searchText, setSearchText] = useState("");
  const [updatingProductIds, setUpdatingProductIds] = useState<Set<string>>(new Set());
  const [stockUpdateError, setStockUpdateError] = useState<string | null>(null);
  const { handleAddToCart, noticeElement } = useAddToCart();

  const handleAdjustStock = async (product: InventoryProduct, adjustment: number) => {
    setStockUpdateError(null);
    setUpdatingProductIds((current) => new Set(current).add(product.id));
    try {
      const quantityInStock = await adjustProductStock(product.id, adjustment);
      updateStockQuantity(product.id, quantityInStock);
      setSelectedProduct((current) =>
        current?.id === product.id ? { ...current, quantityInStock } : current,
      );
    } catch (updateError) {
      setStockUpdateError((updateError as Error).message);
    } finally {
      setUpdatingProductIds((current) => {
        const next = new Set(current);
        next.delete(product.id);
        return next;
      });
    }
  };

  const search = searchText.trim().toLowerCase();
  const visibleProducts = products.filter(
    (product) =>
      (selectedCategory === ALL_CATEGORIES || product.category === selectedCategory) &&
      (!search ||
        product.name.toLowerCase().includes(search) ||
        product.description.toLowerCase().includes(search)),
  );

  const sortedProducts =
    sortOption === "featured"
      ? visibleProducts
      : [...visibleProducts].sort((a, b) =>
          sortOption === "price-low" ? a.price - b.price : b.price - a.price,
        );

  const handleCardClick = (productId: string) => {
    setSelectedProduct(
      products.find((product) => product.id === productId) ?? null,
    );
  };

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
        <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
              Inventory
            </h1>
          </div>
        </div>

        <div className="mb-5 flex flex-col gap-3 sm:flex-row">
          <InventorySearch value={searchText} onChange={setSearchText} />
          <SortControl value={sortOption} onChange={setSortOption} />
        </div>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
          <CategorySidebar
            products={products}
            selected={selectedCategory}
            onSelect={setSelectedCategory}
          />
          <section aria-label="Available groceries">
            {stockUpdateError && (
              <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-white p-4 text-sm text-red-800">
                {stockUpdateError}
              </p>
            )}
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-muted">
                Showing{" "}
                <span className="text-ink">
                  {sortedProducts.length} {sortedProducts.length === 1 ? "item" : "items"}
                </span>
              </p>
              <p className="text-xs font-medium text-muted">
                Prices shown per item
              </p>
            </div>
            {isLoading ? (
              <p role="status" className="rounded-2xl bg-white p-6 text-muted">Loading groceries…</p>
            ) : error ? (
              <div role="alert" className="rounded-2xl border border-red-200 bg-white p-6">
                <p className="text-red-800">{error}</p>
                <button type="button" onClick={() => void reload()} className="mt-4 font-bold text-accent-ink underline">Try again</button>
              </div>
            ) : sortedProducts.length === 0 ? (
              <p className="rounded-2xl border border-border bg-white p-8 text-center text-muted">
                No groceries match your search.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {sortedProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onClick={handleCardClick}
                    onAddToCart={handleAddToCart}
                    isManager={isManager}
                    isUpdatingStock={updatingProductIds.has(product.id)}
                    onAdjustStock={(selected, adjustment) => void handleAdjustStock(selected, adjustment)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {selectedProduct && (
        <ProductDetailPage
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={handleAddToCart}
        />
      )}
      {noticeElement}
    </div>
  );
}
