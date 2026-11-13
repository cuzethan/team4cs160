import type { DeliverySettings } from "../manager/api";
import { deliveryFeeFor, weightLeftBeforeFee } from "./delivery";

type CartSummaryProps = {
  totalPrice: number;
  totalWeight: number;
  deliverySettings: DeliverySettings;
};

export function CartSummary({ totalPrice, totalWeight, deliverySettings }: CartSummaryProps) {
  const { deliveryFee: feeAmount, freeDeliveryWeightThreshold: threshold } = deliverySettings;
  const deliveryFee = deliveryFeeFor(totalWeight, deliverySettings);
  const weightLeft = weightLeftBeforeFee(totalWeight, deliverySettings);
  const percentUsed = threshold > 0 ? Math.min(100, (totalWeight / threshold) * 100) : 100;

  return (
    <section aria-labelledby="cart-summary-heading">
      <h2 id="cart-summary-heading" className="text-xl font-extrabold">Order summary</h2>
      <dl className="mt-5 space-y-4">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Total price</dt>
          <dd className="font-bold">${totalPrice.toFixed(2)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Total weight</dt>
          <dd className="font-bold">{totalWeight.toFixed(1)} lb</dd>
        </div>
        <div className="border-t border-border pt-4">
          <dt className="text-sm font-bold text-muted">Delivery fee</dt>
          <dd className="mt-1 text-sm text-muted">{deliveryFee === 0 ? "Free" : `$${deliveryFee.toFixed(2)}`}</dd>
        </div>
      </dl>

      <div className="mt-4">
        <div
          role="meter"
          aria-label="Cart weight toward the delivery fee limit"
          aria-valuemin={0}
          aria-valuemax={threshold}
          aria-valuenow={Math.min(totalWeight, threshold)}
          className="h-2 overflow-hidden rounded-full bg-border"
        >
          <div
            className={`h-full rounded-full ${weightLeft > 0 ? "bg-accent-ink" : "bg-warning"}`}
            style={{ width: `${percentUsed}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted">
          {weightLeft > 0
            ? `${weightLeft.toFixed(1)} lb left before the $${feeAmount.toFixed(2)} delivery fee (orders under ${threshold} lb ship free).`
            : `Orders of ${threshold} lb or more pay a $${feeAmount.toFixed(2)} delivery fee.`}
        </p>
      </div>
    </section>
  );
}
