export type InventoryProduct = {
  id: string;
  name: string;
  category: string;
  // Temporary placeholder; replace with an image URL or image asset.
  emoji: string;
  price: number;
  /** Present when a product's weight is available for cart totals. */
  weightLbs?: number;
  unit: string;
  quantityInStock: number;
  description: string;
};
