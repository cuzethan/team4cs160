import { describe, expect, it } from "vitest";
import type { CartLine } from "../src/cart/api";
import type { InventoryProduct } from "../src/inventory/types";
import { planReorder } from "../src/orders/reorder";
import type { OrderItem } from "../src/orders/types";

function item(productId: string, productName: string, quantity: number): OrderItem {
  return {
    order_item_id: `${productId}-line`,
    order_id: "order-1",
    product_id: productId,
    productName,
    quantity,
    price_at_purchase: 1,
    weight_at_purchase: 1,
  };
}

function product(id: string, quantityInStock: number): InventoryProduct {
  return {
    id,
    name: id,
    category: "Fruits",
    emoji: "🍎",
    price: 1,
    weightLbs: 1,
    unit: "lb",
    quantityInStock,
    description: "",
    imageUrl: null,
  };
}

function cartLine(productId: string, quantity: number): CartLine {
  return {
    cartItemId: `${productId}-cart`,
    productId,
    name: productId,
    category: "Fruits",
    unit: "lb",
    price: 1,
    weightLbs: 1,
    quantityInStock: 100,
    quantity,
    active: true,
  };
}

describe("planReorder", () => {
  it("adds every item when there is enough stock", () => {
    const plan = planReorder([item("a", "Apples", 2), item("b", "Bread", 1)], [product("a", 10), product("b", 5)], []);
    expect(plan).toEqual({
      toAdd: [
        { productId: "a", name: "Apples", quantity: 2 },
        { productId: "b", name: "Bread", quantity: 1 },
      ],
      reduced: [],
      skipped: [],
    });
  });

  it("caps quantities to stock minus what is already in the cart", () => {
    const plan = planReorder([item("a", "Apples", 5)], [product("a", 6)], [cartLine("a", 3)]);
    expect(plan.toAdd).toEqual([{ productId: "a", name: "Apples", quantity: 3 }]);
    expect(plan.reduced).toEqual(["Apples"]);
  });

  it("skips discontinued and sold-out items", () => {
    const plan = planReorder([item("gone", "Old Cheese", 1), item("a", "Apples", 1)], [product("a", 0)], []);
    expect(plan.toAdd).toEqual([]);
    expect(plan.skipped).toEqual(["Old Cheese", "Apples"]);
  });
});
