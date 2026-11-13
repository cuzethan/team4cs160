// Stock at or below this count is shown as "Only N left" so shoppers know to grab it soon.
export const LOW_STOCK_THRESHOLD = 5;

export type StockLabel = { text: string; tone: "out" | "low" | "normal" };

export function stockLabel(quantityInStock: number): StockLabel {
  if (quantityInStock <= 0) return { text: "Out of stock", tone: "out" };
  if (quantityInStock <= LOW_STOCK_THRESHOLD) return { text: `Only ${quantityInStock} left`, tone: "low" };
  return { text: `${quantityInStock} in stock`, tone: "normal" };
}

export const stockToneClass: Record<StockLabel["tone"], string> = {
  out: "font-bold text-red-700",
  low: "font-bold text-warning",
  normal: "text-muted",
};
