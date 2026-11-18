import { describe, expect, it } from "vitest";
import { LOW_STOCK_THRESHOLD, stockLabel } from "../src/inventory/stock";

describe("stockLabel", () => {
  it("marks empty stock as out of stock", () => {
    expect(stockLabel(0)).toEqual({ text: "Out of stock", tone: "out" });
  });

  it("warns when only a few are left", () => {
    expect(stockLabel(1)).toEqual({ text: "Only 1 left", tone: "low" });
    expect(stockLabel(LOW_STOCK_THRESHOLD)).toEqual({ text: `Only ${LOW_STOCK_THRESHOLD} left`, tone: "low" });
  });

  it("shows the plain count otherwise", () => {
    expect(stockLabel(LOW_STOCK_THRESHOLD + 1)).toEqual({ text: `${LOW_STOCK_THRESHOLD + 1} in stock`, tone: "normal" });
  });
});
