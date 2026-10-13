import type { InventoryProduct } from "./types";

// What GET /api/products sends back for each product.
type CatalogProduct = Omit<InventoryProduct, "emoji">;

// Placeholder pictures until products have images. Known products get their own emoji;
// anything else falls back to one for its category.
const productEmoji: Record<string, string> = {
  "Gala Apples": "🍎",
  "Organic Bananas": "🍌",
  "Hass Avocados": "🥑",
  "Fresh Strawberries": "🍓",
  "Rainbow Carrots": "🥕",
  "Green Broccoli": "🥦",
  "Vine Tomatoes": "🍅",
  "Sweet Corn": "🌽",
  "Baby Spinach": "🥬",
  "Jasmine Rice": "🍚",
  "Whole Grain Bread": "🍞",
  "Rolled Oats": "🥣",
};

const categoryEmoji: Record<string, string> = {
  Fruits: "🍎",
  Vegetables: "🥕",
  Grains: "🌾",
};

export function emojiFor(name: string, category: string) {
  return productEmoji[name] ?? categoryEmoji[category] ?? "🛒";
}

export async function fetchProducts(): Promise<InventoryProduct[]> {
  let response: Response;
  try {
    response = await fetch("/api/products", { credentials: "same-origin" });
  } catch {
    throw new Error("Can't reach the server. Please try again.");
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error ?? "We couldn't load the groceries. Please try again.");
  }
  return (data as { products: CatalogProduct[] }).products.map((product) => ({
    ...product,
    emoji: emojiFor(product.name, product.category),
  }));
}
