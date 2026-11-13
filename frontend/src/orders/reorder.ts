import type { CartLine } from "../cart/api";
import type { InventoryProduct } from "../inventory/types";
import type { OrderItem } from "./types";

export type ReorderPlan = {
  // What to add to the cart, already capped to what's in stock.
  toAdd: { productId: string; name: string; quantity: number }[];
  // Items that were only partly added because stock is short.
  reduced: string[];
  // Items that couldn't be added at all (discontinued or sold out).
  skipped: string[];
};

// Works out how much of a past order can go back into the cart right now.
// `products` is the active catalog; anything not in it has been discontinued.
export function planReorder(items: OrderItem[], products: InventoryProduct[], cart: CartLine[]): ReorderPlan {
  const plan: ReorderPlan = { toAdd: [], reduced: [], skipped: [] };
  const wanted = new Map<string, { name: string; quantity: number }>();
  for (const item of items) {
    const current = wanted.get(item.product_id);
    wanted.set(item.product_id, { name: item.productName, quantity: (current?.quantity ?? 0) + item.quantity });
  }

  for (const [productId, { name, quantity }] of wanted) {
    const product = products.find((candidate) => candidate.id === productId);
    const inCart = cart.find((line) => line.productId === productId)?.quantity ?? 0;
    const available = product ? Math.max(0, product.quantityInStock - inCart) : 0;
    const amount = Math.min(quantity, available);
    if (amount === 0) {
      plan.skipped.push(name);
      continue;
    }
    if (amount < quantity) plan.reduced.push(name);
    plan.toAdd.push({ productId, name, quantity: amount });
  }
  return plan;
}
