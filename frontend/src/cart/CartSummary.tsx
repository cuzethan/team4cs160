type CartSummaryProps = {
  totalPrice: number;
  totalWeight: number;
  deliveryStatus: string;
};

export function CartSummary({ totalPrice, totalWeight, deliveryStatus }: CartSummaryProps) {
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
          <dd className="mt-1 text-sm text-muted">{deliveryStatus}</dd>
        </div>
      </dl>
    </section>
  );
}
