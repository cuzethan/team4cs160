import type { InventoryProduct } from "../inventory/types";
import type { CartLine } from "./api";

export type CartItem = InventoryProduct & {
  cartItemId: string;
  quantity: number;
  weightLbs: number;
};

// Fills in the display details (emoji, unit, category) the cart API doesn't store yet.
export function toCartItem(line: CartLine, catalog: InventoryProduct[]): CartItem {
  const product = catalog.find((candidate) => candidate.id === line.productId);
  return {
    id: line.productId,
    name: line.name,
    category: product?.category ?? "",
    emoji: product?.emoji ?? "🛒",
    price: line.price,
    unit: product?.unit ?? "each",
    quantityInStock: line.quantityInStock,
    description: product?.description ?? "",
    cartItemId: line.cartItemId,
    quantity: line.quantity,
    weightLbs: line.weightLbs,
  };
}
