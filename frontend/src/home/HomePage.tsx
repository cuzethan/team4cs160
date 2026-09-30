import { useState } from "react";
import { Link } from "react-router-dom";
import { products } from "../inventory/InventoryPage";
import { ProductCard } from "../inventory/ProductCard";
import { ProductDetailPage } from "../inventory/ProductDetailPage";
import type { InventoryProduct } from "../inventory/types";

const FREE_DELIVERY_LIMIT_LBS = 20;
const DELIVERY_FEE = 10;

const categories = [
  { name: "Fruits", emoji: "🍎", blurb: "Apples, berries, bananas and more" },
  { name: "Vegetables", emoji: "🥦", blurb: "Leafy greens, carrots, corn and more" },
  { name: "Grains", emoji: "🍞", blurb: "Bread, rice, oats and more" },
];

const steps = [
  {
    title: "Pick your groceries",
    body: "Browse fresh organic produce and add what you need to your cart.",
  },
  {
    title: "Check out",
    body: "See your total price and cart weight before you pay.",
  },
  {
    title: "Track your robot",
    body: "Our delivery robot brings your order to your door. Follow it live.",
  },
];

// Placeholder until the Products API exists; replace with a fetch of featured products.
const featuredProductIds = ["strawberry", "avocado", "spinach", "bread"];
const featuredProducts = products.filter((product) => featuredProductIds.includes(product.id));

function HomeHeader() {
  return (
    <header className="border-b border-[#ecebe2] bg-[#fffefa]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Link
          to="/home"
          className="text-lg font-extrabold tracking-tight text-[#2e4935]"
          aria-label="OFS home"
        >
          OFS
        </Link>
        <nav aria-label="Main" className="flex items-center gap-2 sm:gap-3">
          <Link
            to="/inventory"
            className="rounded-full px-4 py-2.5 text-sm font-bold text-[#426149] hover:bg-[#f0f3e8]"
          >
            Shop
          </Link>
          <button
            type="button"
            className="flex h-11 items-center gap-2 rounded-full border border-[#e5e7dc] bg-white px-4 text-sm font-bold text-[#426149] shadow-sm"
          >
            <span aria-hidden="true">🛒</span>
            <span className="hidden sm:inline">Your cart</span>
          </button>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="overflow-hidden rounded-3xl bg-[#2e4935] text-white">
      <div className="grid items-center gap-8 px-6 py-10 sm:px-10 sm:py-14 md:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#cfe3c0]">
            Organic Food Store · San Jose
          </p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Fresh organic groceries, delivered to your door
          </h1>
          <p className="mt-4 max-w-xl text-lg text-[#e4eedb]">
            Shop online and our delivery robot brings your order to you. Delivery is free
            for orders under {FREE_DELIVERY_LIMIT_LBS} lbs.
          </p>
          <Link
            to="/inventory"
            className="mt-7 inline-flex h-13 items-center rounded-full bg-[#f5d77a] px-7 text-base font-extrabold text-[#253b2d] transition hover:bg-[#f0cc5c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Shop groceries
          </Link>
        </div>
        <div aria-hidden="true" className="hidden text-[8rem] leading-none md:block">
          🧺
        </div>
      </div>
    </section>
  );
}

function CategoryTiles() {
  return (
    <section aria-labelledby="categories-heading">
      <h2 id="categories-heading" className="text-2xl font-extrabold text-[#294332]">
        Shop by category
      </h2>
      <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {categories.map((category) => (
          <li key={category.name}>
            <Link
              to={`/inventory?category=${encodeURIComponent(category.name)}`}
              className="flex items-center gap-4 rounded-2xl border border-[#e8e7dc] bg-white p-5 shadow-[0_3px_12px_rgba(42,65,48,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(42,65,48,0.12)] focus-visible:outline-2 focus-visible:outline-emerald-700"
            >
              <span
                aria-hidden="true"
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#f3f5e9] text-4xl"
              >
                {category.emoji}
              </span>
              <span>
                <span className="block text-lg font-bold text-[#253b2d]">{category.name}</span>
                <span className="block text-sm text-[#5f6b61]">{category.blurb}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HowItWorks() {
  return (
    <section aria-labelledby="how-heading">
      <h2 id="how-heading" className="text-2xl font-extrabold text-[#294332]">
        How it works
      </h2>
      <ol className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="rounded-2xl border border-[#e8e7dc] bg-white p-5 shadow-[0_3px_12px_rgba(42,65,48,0.04)]"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e9f1df] text-base font-extrabold text-[#416449]">
              {index + 1}
            </span>
            <h3 className="mt-3 text-lg font-bold text-[#253b2d]">{step.title}</h3>
            <p className="mt-1 text-base text-[#5f6b61]">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DeliveryInfo() {
  return (
    <section
      aria-labelledby="delivery-heading"
      className="rounded-2xl border border-[#e8e7dc] bg-white p-6 shadow-[0_3px_12px_rgba(42,65,48,0.04)] sm:p-8"
    >
      <h2 id="delivery-heading" className="text-2xl font-extrabold text-[#294332]">
        Delivery at a glance
      </h2>
      <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-[#e9f1df] p-4">
          <dt className="text-sm font-bold text-[#416449]">Under {FREE_DELIVERY_LIMIT_LBS} lbs</dt>
          <dd className="mt-1 text-2xl font-extrabold text-[#253b2d]">Free delivery</dd>
        </div>
        <div className="rounded-xl bg-[#fbf1d6] p-4">
          <dt className="text-sm font-bold text-[#7a5b12]">{FREE_DELIVERY_LIMIT_LBS} lbs or more</dt>
          <dd className="mt-1 text-2xl font-extrabold text-[#253b2d]">${DELIVERY_FEE} fee</dd>
        </div>
        <div className="rounded-xl bg-[#f3f5e9] p-4">
          <dt className="text-sm font-bold text-[#55705b]">Drop-off spot</dt>
          <dd className="mt-1 text-base font-semibold text-[#253b2d]">
            Tell us exactly where to leave it. Front door by default.
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-sm text-[#5f6b61]">
        Your cart always shows its total weight, so you'll know before checkout.
      </p>
    </section>
  );
}

function FeaturedProducts() {
  const [selectedProduct, setSelectedProduct] = useState<InventoryProduct | null>(null);

  return (
    <section aria-labelledby="featured-heading">
      <div className="flex items-end justify-between gap-4">
        <h2 id="featured-heading" className="text-2xl font-extrabold text-[#294332]">
          Fresh picks this week
        </h2>
        <Link to="/inventory" className="text-sm font-bold text-[#416449] underline-offset-4 hover:underline">
          See all groceries
        </Link>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {featuredProducts.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onClick={(productId) =>
              setSelectedProduct(featuredProducts.find((p) => p.id === productId) ?? null)
            }
            onAddToCart={() => undefined}
          />
        ))}
      </div>
      {selectedProduct && (
        <ProductDetailPage product={selectedProduct} onClose={() => setSelectedProduct(null)} />
      )}
    </section>
  );
}

function OrdersBanner() {
  return (
    <section
      aria-labelledby="orders-heading"
      className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-[#e8e7dc] bg-[#fffefa] p-6 sm:flex-row sm:items-center"
    >
      <div>
        <h2 id="orders-heading" className="text-xl font-extrabold text-[#294332]">
          Waiting on a delivery?
        </h2>
        <p className="mt-1 text-base text-[#5f6b61]">
          Check your orders and see where your robot is right now.
        </p>
      </div>
      <button
        type="button"
        className="rounded-full border-2 border-[#2e4935] px-5 py-2.5 text-sm font-bold text-[#2e4935] transition hover:bg-[#2e4935] hover:text-white"
      >
        View my orders
      </button>
    </section>
  );
}

export function HomePage() {
  return (
    <div className="min-h-screen bg-[#fbfaf5] text-[#253b2d]">
      <HomeHeader />
      <main className="mx-auto flex max-w-7xl flex-col gap-12 px-5 py-8 sm:px-8 sm:py-12">
        <Hero />
        <CategoryTiles />
        <FeaturedProducts />
        <HowItWorks />
        <DeliveryInfo />
        <OrdersBanner />
      </main>
      <footer className="border-t border-[#ecebe2] py-6 text-center text-sm text-[#5f6b61]">
        OFS · Organic Food Store, San Jose
      </footer>
    </div>
  );
}
