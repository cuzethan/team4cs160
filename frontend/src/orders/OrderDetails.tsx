import type { CustomerOrder } from "./types";

type OrderDetailsProps = {
  order: CustomerOrder;
};

export function OrderDetails({ order }: OrderDetailsProps) {
  return (
    <section aria-label={`Details for order ${order.id}`} className="border-t border-border px-5 py-5 sm:px-6">
      <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
        <p><span className="font-bold text-muted">Order status:</span> <span className="text-muted">{order.status.replaceAll("_", " ")}</span></p>
        <p><span className="font-bold text-muted">Delivery status:</span> <span className="text-muted">{order.deliveryStatus?.replaceAll("_", " ") ?? "Not available"}</span></p>
      </div>

      <h3 className="mt-5 text-sm font-extrabold uppercase tracking-wide text-muted">Purchased items</h3>
      <ul className="mt-3 divide-y divide-border">
        {order.items.map((item) => (
          <li key={item.order_item_id} className="flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center">
            <div>
              <p className="font-bold text-ink">{item.productName}</p>
              <p className="mt-1 text-sm text-muted">
                Quantity: {item.quantity} · {item.weight_at_purchase.toFixed(1)} lb each
              </p>
            </div>
            <p className="text-sm font-semibold text-ink">
              ${item.price_at_purchase.toFixed(2)} each · ${(item.price_at_purchase * item.quantity).toFixed(2)} total
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
