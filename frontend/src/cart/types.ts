import { emojiFor } from "../inventory/api";
import type { InventoryProduct } from "../inventory/types";
import type { CartLine } from "./api";

export type CartItem = InventoryProduct & {
  cartItemId: string;
  quantity: number;
};

export function toCartItem(line: CartLine): CartItem {
  return {
    id: line.productId,
    name: line.name,
    category: line.category,
    emoji: emojiFor(line.name, line.category),
    price: line.price,
    weightLbs: line.weightLbs,
    unit: line.unit,
    quantityInStock: line.quantityInStock,
    description: "",
    imageUrl: null,
    cartItemId: line.cartItemId,
    quantity: line.quantity,
  };
}
