import { describe, expect, it } from "vitest";
import { parseStockAmount } from "../src/inventory/ProductCard";

describe("parseStockAmount", () => {
  it("accepts whole numbers, including bulk amounts", () => {
    expect(parseStockAmount("1")).toBe(1);
    expect(parseStockAmount("250")).toBe(250);
    expect(parseStockAmount(" 100 ")).toBe(100);
  });

  it("rejects empty, zero, negative, decimal, and too-large amounts", () => {
    for (const text of ["", "0", "-5", "2.5", "1e3", "abc", "2147483648"]) {
      expect(parseStockAmount(text)).toBeNull();
    }
  });
});
