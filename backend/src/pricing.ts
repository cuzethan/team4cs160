// Must match FREE_DELIVERY_LIMIT_LBS and DELIVERY_FEE in frontend/src/cart/delivery.ts.
export const FREE_DELIVERY_LIMIT_LBS = 20;
export const DELIVERY_FEE = 10;

export function deliveryFeeFor(totalWeightLbs: number) {
  return totalWeightLbs < FREE_DELIVERY_LIMIT_LBS ? 0 : DELIVERY_FEE;
}

// Rounds to cents so totals like 0.1 + 0.2 don't leak floating-point noise.
export function roundCents(amount: number) {
  return Math.round(amount * 100) / 100;
}
