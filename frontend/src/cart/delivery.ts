// Must match FREE_DELIVERY_LIMIT_LBS and DELIVERY_FEE in backend/src/pricing.ts.
export const FREE_DELIVERY_LIMIT_LBS = 20;
export const DELIVERY_FEE = 10;

export function deliveryFeeFor(totalWeightLbs: number) {
  return totalWeightLbs < FREE_DELIVERY_LIMIT_LBS ? 0 : DELIVERY_FEE;
}
