import type { InventoryProduct } from "../inventory/types";

export type CartItem = InventoryProduct & {
  cartItemId: string;
  quantity: number;
  weightLbs: number;
};
