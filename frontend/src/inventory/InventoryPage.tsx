import { useState } from "react";
import { ProductCard } from "./ProductCard";
import { ProductDetailPage } from "./ProductDetailPage";
import type { InventoryProduct } from "./types";

const categories = ["All groceries", "Fruits", "Vegetables", "Grains"];

const products: InventoryProduct[] = [
  {
    id: "apple-gala",
    name: "Gala Apples",
    category: "Fruits",
    emoji: "🍎",
    price: 1.49,
    unit: "lb",
    quantityInStock: 34,
    description:
      "Sweet, crisp Gala apples with a bright red skin. A perfect snack for lunchboxes or a fresh addition to salads.",
  },
  {
    id: "banana",
    name: "Organic Bananas",
    category: "Fruits",
    emoji: "🍌",
    price: 0.89,
    unit: "lb",
    quantityInStock: 42,
    description:
      "Naturally sweet organic bananas, picked at their best and ready for smoothies, baking, or an easy snack.",
  },
  {
    id: "avocado",
    name: "Hass Avocados",
    category: "Fruits",
    emoji: "🥑",
    price: 1.25,
    unit: "each",
    quantityInStock: 18,
    description:
      "Creamy ripe Hass avocados with rich flavor. Mash them for toast or dice them into your favorite bowl.",
  },
  {
    id: "strawberry",
    name: "Fresh Strawberries",
    category: "Fruits",
    emoji: "🍓",
    price: 4.29,
    unit: "basket",
    quantityInStock: 16,
    description:
      "Juicy, fragrant strawberries packed fresh for snacking, desserts, or a colorful breakfast topping.",
  },
  {
    id: "carrot",
    name: "Rainbow Carrots",
    category: "Vegetables",
    emoji: "🥕",
    price: 2.19,
    unit: "bunch",
    quantityInStock: 21,
    description:
      "A colorful bunch of sweet and crunchy carrots. Roast them, shred them into salads, or enjoy them raw.",
  },
  {
    id: "broccoli",
    name: "Green Broccoli",
    category: "Vegetables",
    emoji: "🥦",
    price: 2.49,
    unit: "each",
    quantityInStock: 13,
    description:
      "Fresh green broccoli crowns with tender stems. Steam, roast, or stir-fry for a quick, versatile side.",
  },
  {
    id: "tomato",
    name: "Vine Tomatoes",
    category: "Vegetables",
    emoji: "🍅",
    price: 2.99,
    unit: "lb",
    quantityInStock: 24,
    description:
      "Ripe tomatoes grown on the vine for a juicy texture and balanced sweetness in sandwiches and salads.",
  },
  {
    id: "corn",
    name: "Sweet Corn",
    category: "Vegetables",
    emoji: "🌽",
    price: 0.79,
    unit: "each",
    quantityInStock: 30,
    description:
      "Golden sweet corn with tender kernels. Grill it in the husk or boil for a simple summer favorite.",
  },
  {
    id: "spinach",
    name: "Baby Spinach",
    category: "Vegetables",
    emoji: "🥬",
    price: 3.49,
    unit: "bag",
    quantityInStock: 12,
    description:
      "Tender baby spinach leaves, washed and ready to add to salads, omelets, pastas, and smoothies.",
  },
  {
    id: "rice",
    name: "Jasmine Rice",
    category: "Grains",
    emoji: "🍚",
    price: 5.99,
    unit: "bag",
    quantityInStock: 19,
    description:
      "Fragrant long-grain jasmine rice that cooks up light and fluffy. A lovely everyday base for many meals.",
  },
  {
    id: "bread",
    name: "Whole Grain Bread",
    category: "Grains",
    emoji: "🍞",
    price: 4.19,
    unit: "loaf",
    quantityInStock: 11,
    description:
      "Soft, hearty whole grain bread baked with a blend of grains and seeds for a satisfying everyday loaf.",
  },
  {
    id: "oats",
    name: "Rolled Oats",
    category: "Grains",
    emoji: "🥣",
    price: 3.79,
    unit: "bag",
    quantityInStock: 27,
    description:
      "Whole rolled oats for warm breakfasts, overnight oats, homemade granola, or baking.",
  },
];

function CategorySidebar() {
  return (
    <aside className="rounded-2xl border border-[#e8e7dc] bg-white p-5 shadow-[0_3px_12px_rgba(42,65,48,0.04)]">
      <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#7d887b]">
        Shop by category
      </h2>
      <ul className="mt-4 space-y-1">
        {categories.map((category, index) => (
          <li key={category}>
            <button
              type="button"
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${index === 0 ? "bg-[#e9f1df] font-bold text-[#416449]" : "font-medium text-[#667269] hover:bg-[#f6f7f1]"}`}
            >
              <span>{category}</span>
              <span className="text-xs text-[#90998f]">
                {index === 0
                  ? "12"
                  : index === 1
                    ? "4"
                    : index === 2
                      ? "5"
                      : "3"}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function InventorySearch() {
  return (
    <label className="flex h-12 flex-1 items-center gap-3 rounded-xl border border-[#e6e6dc] bg-white px-4 text-[#899188] shadow-sm">
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
        className="w-full bg-transparent text-sm text-[#304336] outline-none placeholder:text-[#a3aaa1]"
      />
    </label>
  );
}

function SortControl() {
  return (
    <label className="flex h-12 items-center gap-2 rounded-xl border border-[#e6e6dc] bg-white px-4 text-sm text-[#667269] shadow-sm">
      <span className="whitespace-nowrap">Sort by</span>
      <select
        aria-label="Sort products"
        defaultValue="featured"
        className="max-w-36 bg-transparent font-semibold text-[#304336] outline-none"
      >
        <option value="featured">Featured</option>
        <option value="price-low">Price: low to high</option>
        <option value="price-high">Price: high to low</option>
      </select>
    </label>
  );
}

export function InventoryPage() {
  const [selectedProduct, setSelectedProduct] =
    useState<InventoryProduct | null>(null);

  const handleCardClick = (productId: string) => {
    setSelectedProduct(
      products.find((product) => product.id === productId) ?? null,
    );
  };

  return (
    <div className="min-h-screen bg-[#fbfaf5] text-[#253b2d]">
      <header className="border-b border-[#ecebe2] bg-[#fffefa]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <a
            href="/inventory"
            className="text-lg font-extrabold tracking-tight text-[#2e4935]"
            aria-label="OFS home"
          >
            OFS
          </a>
          <button
            type="button"
            className="flex h-11 items-center gap-2 rounded-full border border-[#e5e7dc] bg-white px-4 text-sm font-bold text-[#426149] shadow-sm"
          >
            <span aria-hidden="true">🛒</span>
            <span className="hidden sm:inline">Your cart</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
        <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-[#294332] sm:text-5xl">
              Inventory
            </h1>
          </div>
        </div>

        <div className="mb-5 flex flex-col gap-3 sm:flex-row">
          <InventorySearch />
          <SortControl />
        </div>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
          <CategorySidebar />
          <section aria-label="Available groceries">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-[#718071]">
                Showing <span className="text-[#314a37]">12 items</span>
              </p>
              <p className="text-xs font-medium text-[#9aa197]">
                Prices shown per item
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onClick={handleCardClick}
                  onAddToCart={() => undefined}
                />
              ))}
            </div>
          </section>
        </div>
      </main>

      {selectedProduct && (
        <ProductDetailPage
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </div>
  );
}
