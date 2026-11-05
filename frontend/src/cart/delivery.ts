import type { DeliverySettings } from "../manager/api";

export const DEFAULT_DELIVERY_SETTINGS: DeliverySettings = { deliveryFee: 10, freeDeliveryWeightThreshold: 20, deliveryRadiusMiles: 50 };

export function deliveryFeeFor(totalWeightLbs: number, settings: DeliverySettings = DEFAULT_DELIVERY_SETTINGS) {
  return totalWeightLbs < settings.freeDeliveryWeightThreshold ? 0 : settings.deliveryFee;
}
