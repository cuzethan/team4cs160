import { describe, expect, it } from "vitest";
import { deliveryFeeFor, weightLeftBeforeFee } from "../src/cart/delivery";

const settings = { deliveryFee: 10, freeDeliveryWeightThreshold: 20 };

describe("weightLeftBeforeFee", () => {
  it("counts the pounds left before the fee applies", () => {
    expect(weightLeftBeforeFee(0, settings)).toBe(20);
    expect(weightLeftBeforeFee(15.5, settings)).toBe(4.5);
  });

  it("is zero once the order reaches the fee weight", () => {
    expect(weightLeftBeforeFee(20, settings)).toBe(0);
    expect(weightLeftBeforeFee(32, settings)).toBe(0);
    expect(deliveryFeeFor(20, settings)).toBe(10);
  });
});
