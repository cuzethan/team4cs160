export type DeliverySettings = {
  deliveryFee: number;
  freeDeliveryWeightThreshold: number;
  maxDeliveryDistanceMiles: number;
};
export const DEFAULT_DELIVERY_SETTINGS: DeliverySettings = {
  deliveryFee: 10,
  freeDeliveryWeightThreshold: 20,
  maxDeliveryDistanceMiles: 50,
};

export function deliveryFeeFor(totalWeightLbs: number, settings: DeliverySettings = DEFAULT_DELIVERY_SETTINGS) {
  return totalWeightLbs < settings.freeDeliveryWeightThreshold ? 0 : settings.deliveryFee;
}

// Rounds to cents so totals like 0.1 + 0.2 don't leak floating-point noise.
export function roundCents(amount: number) {
  return Math.round(amount * 100) / 100;
}
