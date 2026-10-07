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
          <dt className="text-[#667269]">Total price</dt>
          <dd className="font-bold">${totalPrice.toFixed(2)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-[#667269]">Total weight</dt>
          <dd className="font-bold">{totalWeight.toFixed(1)} lb</dd>
        </div>
        <div className="border-t border-[#ecebe2] pt-4">
          <dt className="text-sm font-bold text-[#55705b]">Delivery fee</dt>
          <dd className="mt-1 text-sm text-[#667269]">{deliveryStatus}</dd>
        </div>
      </dl>
    </section>
  );
}
