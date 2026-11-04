import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { SiteHeader } from "../components/SiteHeader";
import { ProductCard } from "../inventory/ProductCard";
import { ProductDetailPage } from "../inventory/ProductDetailPage";
import type { InventoryProduct } from "../inventory/types";
import { useProducts } from "../inventory/useProducts";
import { useAddToCart } from "../cart/useAddToCart";
import { fetchDeliverySettings, type DeliverySettings } from "../manager/api";
import { DEFAULT_DELIVERY_SETTINGS } from "../cart/delivery";

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

// Shown first when they are in stock; any other products fill the remaining spots.
const featuredProductNames = ["Fresh Strawberries", "Hass Avocados", "Baby Spinach", "Whole Grain Bread"];
const FEATURED_COUNT = 4;

function Hero({ threshold }: { threshold: number }) {
  const { user, loading } = useAuth();

  return (
    <section className="overflow-hidden rounded-3xl bg-ink text-white">
      <div className="grid items-center gap-8 px-6 py-10 sm:px-10 sm:py-14 md:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          {user ? (
            <p className="mb-4 text-3xl font-extrabold text-accent">Hello, {user.firstName}! 👋</p>
          ) : !loading ? (
            <p className="mb-4 text-base text-white/70">
              You're not logged in.{" "}
              <Link to="/login" className="font-bold text-accent underline-offset-2 hover:underline">Log in</Link>
              {" "}or{" "}
              <Link to="/register" className="font-bold text-accent underline-offset-2 hover:underline">create an account</Link>.
            </p>
          ) : null}
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-white/70">
            Organic Food Store · San Jose
          </p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Fresh organic groceries, delivered to your door
          </h1>
          <p className="mt-4 max-w-xl text-lg text-white/70">
            Shop online and our delivery robot brings your order to you. Delivery is free
            for orders under {threshold} lbs.
          </p>
          <Link
            to="/inventory"
            className="mt-7 inline-flex h-13 items-center rounded-full bg-accent px-7 text-base font-extrabold text-on-accent transition hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
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
      <h2 id="categories-heading" className="text-2xl font-extrabold text-ink">
        Shop by category
      </h2>
      <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {categories.map((category) => (
          <li key={category.name}>
            <Link
              to={`/inventory?category=${encodeURIComponent(category.name)}`}
              className="flex items-center gap-4 rounded-2xl border border-border bg-white p-5 shadow-[0_3px_12px_rgba(0,0,0,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(0,0,0,0.08)] focus-visible:outline-2 focus-visible:outline-accent-ink"
            >
              <span
                aria-hidden="true"
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-canvas text-4xl"
              >
                {category.emoji}
              </span>
              <span>
                <span className="block text-lg font-bold text-ink">{category.name}</span>
                <span className="block text-sm text-muted">{category.blurb}</span>
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
      <h2 id="how-heading" className="text-2xl font-extrabold text-ink">
        How it works
      </h2>
      <ol className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="rounded-2xl border border-border bg-white p-5 shadow-[0_3px_12px_rgba(0,0,0,0.06)]"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-base font-extrabold text-accent-ink">
              {index + 1}
            </span>
            <h3 className="mt-3 text-lg font-bold text-ink">{step.title}</h3>
            <p className="mt-1 text-base text-muted">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function DeliveryInfo({ settings }: { settings: DeliverySettings }) {
  return (
    <section
      aria-labelledby="delivery-heading"
      className="rounded-2xl border border-border bg-white p-6 shadow-[0_3px_12px_rgba(0,0,0,0.06)] sm:p-8"
    >
      <h2 id="delivery-heading" className="text-2xl font-extrabold text-ink">
        Delivery at a glance
      </h2>
      <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-accent-soft p-4">
          <dt className="text-sm font-bold text-accent-ink">Under {settings.freeDeliveryWeightThreshold} lbs</dt>
          <dd className="mt-1 text-2xl font-extrabold text-ink">Free delivery</dd>
        </div>
        <div className="rounded-xl bg-warning-soft p-4">
          <dt className="text-sm font-bold text-warning">{settings.freeDeliveryWeightThreshold} lbs or more</dt>
          <dd className="mt-1 text-2xl font-extrabold text-ink">${settings.deliveryFee.toFixed(2)} fee</dd>
        </div>
        <div className="rounded-xl bg-canvas p-4">
          <dt className="text-sm font-bold text-muted">Drop-off spot</dt>
          <dd className="mt-1 text-base font-semibold text-ink">
            Tell us exactly where to leave it. Front door by default.
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-sm text-muted">
        Your cart always shows its total weight, so you'll know before checkout.
      </p>
    </section>
  );
}

function FeaturedProducts() {
  const [selectedProduct, setSelectedProduct] = useState<InventoryProduct | null>(null);
  const { handleAddToCart, noticeElement } = useAddToCart();
  const { products } = useProducts();
  const featuredProducts = [
    ...products.filter((product) => featuredProductNames.includes(product.name)),
    ...products.filter((product) => !featuredProductNames.includes(product.name)),
  ]
    .filter((product) => product.quantityInStock > 0)
    .slice(0, FEATURED_COUNT);

  return (
    <section aria-labelledby="featured-heading">
      <div className="flex items-end justify-between gap-4">
        <h2 id="featured-heading" className="text-2xl font-extrabold text-ink">
          Fresh picks this week
        </h2>
        <Link to="/inventory" className="text-sm font-bold text-accent-ink underline-offset-4 hover:underline">
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
            onAddToCart={handleAddToCart}
          />
        ))}
      </div>
      {selectedProduct && (
        <ProductDetailPage
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={handleAddToCart}
        />
      )}
      {noticeElement}
    </section>
  );
}

function OrdersBanner() {
  return (
    <section
      aria-labelledby="orders-heading"
      className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-border bg-surface p-6 sm:flex-row sm:items-center"
    >
      <div>
        <h2 id="orders-heading" className="text-xl font-extrabold text-ink">
          Waiting on a delivery?
        </h2>
        <p className="mt-1 text-base text-muted">
          Check your orders and see where your robot is right now.
        </p>
      </div>
      <Link
        to="/orders"
        className="rounded-full border-2 border-ink px-5 py-2.5 text-sm font-bold text-ink transition hover:bg-ink hover:text-white"
      >
        View my orders
      </Link>
    </section>
  );
}

// A one-time message passed by navigate("/", { state: { notice } }), e.g. after logging out.
function NoticeBanner() {
  const location = useLocation();
  const navigate = useNavigate();
  const notice = (location.state as { notice?: string } | null)?.notice;
  if (!notice) return null;

  return (
    <div role="status" className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-accent-soft px-5 py-4 font-semibold text-ink">
      <span>{notice}</span>
      <button
        type="button"
        onClick={() => navigate(".", { replace: true, state: null })}
        className="cursor-pointer rounded-full px-3 py-1 text-sm font-bold text-ink hover:bg-accent-soft"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

export function HomePage() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [deliverySettings, setDeliverySettings] = useState<DeliverySettings>(DEFAULT_DELIVERY_SETTINGS);
  useEffect(() => { void fetchDeliverySettings().then(setDeliverySettings).catch(() => {}); }, []);

  if (loading) {
    return <main className="p-8 text-center text-muted" aria-live="polite">Loading your account...</main>;
  }
  if (user?.role === "manager" && location.pathname !== "/customer-storefront") {
    return <Navigate to="/manager-dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SiteHeader />
      <main className="mx-auto flex max-w-7xl flex-col gap-12 px-5 py-8 sm:px-8 sm:py-12">
        <NoticeBanner />
        <Hero threshold={deliverySettings.freeDeliveryWeightThreshold} />
        <CategoryTiles />
        <FeaturedProducts />
        <HowItWorks />
        <DeliveryInfo settings={deliverySettings} />
        <OrdersBanner />
      </main>
      <footer className="border-t border-border py-6 text-center text-sm text-muted">
        OFS · Organic Food Store, San Jose
      </footer>
    </div>
  );
}
