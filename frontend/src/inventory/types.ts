export type InventoryProduct = {
  id: string;
  name: string;
  category: string;
  // Temporary placeholder; replace with an image URL or image asset.
  emoji: string;
  price: number;
  weightLbs: number;
  unit: string;
  quantityInStock: number;
  description: string;
  imageUrl: string | null;
};
