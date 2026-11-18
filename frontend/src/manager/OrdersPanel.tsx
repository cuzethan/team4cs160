import { useEffect, useState } from "react";
import { fetchManagerOrders, orderGroup, orderMatchesSearch, type ManagerOrder, type OrderGroup } from "./api";

const PAGE_SIZE = 25;

const cardClassName = "rounded-2xl border border-border bg-white shadow-[0_3px_12px_rgba(0,0,0,0.06)]";

type Filter = "all" | OrderGroup;

const groupLabels: Record<OrderGroup, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-amber-50 text-amber-800" },
  out_for_delivery: { label: "Out for delivery", className: "bg-accent-soft text-accent-ink" },
  completed: { label: "Completed", className: "bg-green-50 text-green-800" },
  cancelled: { label: "Cancelled", className: "bg-gray-100 text-gray-700" },
  refunded: { label: "Refunded", className: "bg-red-50 text-red-800" },
};

const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "All orders" },
  { value: "pending", label: "Pending" },
  { value: "out_for_delivery", label: "Out for delivery" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
];

function shortOrderId(orderId: string) {
  return `#${orderId.slice(0, 8).toUpperCase()}`;
}

function itemSummary(order: ManagerOrder) {
  const [first, ...rest] = order.items;
  if (!first) return "No items";
  return `${first.productName} × ${first.quantity}${rest.length ? `, +${rest.length} more` : ""}`;
}

// Every order in one place: counts by status, a filter for each, and search by
// customer, order number, or item.
export function OrdersPanel() {
  const [orders, setOrders] = useState<ManagerOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    let active = true;
    fetchManagerOrders()
      .then((loaded) => {
        if (active) setOrders(loaded);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load orders.");
      });
    return () => {
      active = false;
    };
  }, []);

  const counts = { all: orders?.length ?? 0, pending: 0, out_for_delivery: 0, completed: 0, cancelled: 0, refunded: 0 };
  for (const order of orders ?? []) counts[orderGroup(order)] += 1;

  const shown = (orders ?? []).filter(
    (order) => (filter === "all" || orderGroup(order) === filter) && orderMatchesSearch(order, search),
  );

  return (
    <>
      <div className="mb-5">
        <h2 className="text-2xl font-extrabold text-ink">Orders</h2>
        <p className="mt-1 text-sm text-muted">Every order, by status. Search by customer, order number, or item.</p>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-white p-5 text-sm text-red-700">{error}</p>
      ) : !orders ? (
        <p role="status" className="rounded-xl border border-border bg-white p-5 text-sm text-muted">Loading orders…</p>
      ) : (
        <div className="space-y-4">
          <div role="group" aria-label="Filter by status" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {filters.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`${cardClassName} p-4 text-left transition hover:border-accent-ink ${
                  filter === value ? "border-accent-ink ring-2 ring-accent" : ""
                }`}
              >
                <span className="block text-sm font-bold text-muted">{label}</span>
                <span className="mt-1 block text-2xl font-extrabold tabular-nums text-ink">{counts[value]}</span>
              </button>
            ))}
          </div>

          <section aria-label="Orders" className={`${cardClassName} overflow-hidden`}>
            <div className="border-b border-border px-5 py-4 sm:px-6">
              <input
                type="search"
                aria-label="Search orders"
                placeholder="Search customer, email, order number, or item"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setVisibleCount(PAGE_SIZE);
                }}
                className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-accent-ink sm:max-w-md"
              />
              <p className="mt-2 text-xs text-muted">
                Showing {Math.min(visibleCount, shown.length)} of {shown.length} {filter === "all" ? "" : `${groupLabels[filter].label.toLowerCase()} `}order{shown.length === 1 ? "" : "s"}{search.trim() ? " matching your search" : ""}
              </p>
            </div>

            {shown.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted sm:px-6">No orders match.</p>
            ) : (
              <ul className="divide-y divide-border">
                {shown.slice(0, visibleCount).map((order) => {
                  const group = groupLabels[orderGroup(order)];
                  const isOpen = openOrderId === order.orderId;
                  return (
                    <li key={order.orderId}>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setOpenOrderId(isOpen ? null : order.orderId)}
                        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-4 text-left hover:bg-canvas sm:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)_6rem_8.5rem] sm:px-6"
                      >
                        <span className="min-w-0">
                          <span className="block font-bold text-ink">{shortOrderId(order.orderId)}</span>
                          <span className="block text-xs text-muted">{new Date(order.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                        </span>
                        <span className="text-right sm:order-last">
                          <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${group.className}`}>{group.label}</span>
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-ink">{order.customerName}</span>
                          <span className="block truncate text-xs text-muted">{order.customerEmail}</span>
                        </span>
                        <span className="min-w-0 truncate text-sm text-muted">{itemSummary(order)}</span>
                        <span className="text-right text-sm font-bold tabular-nums text-ink sm:text-right">${order.grandTotal.toFixed(2)}</span>
                      </button>
                      {isOpen && (
                        <div className="bg-canvas px-5 pb-5 pt-1 sm:px-6">
                          <ul className="divide-y divide-border rounded-xl border border-border bg-white">
                            {order.items.map((item) => (
                              <li key={item.orderItemId} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                                <span className="min-w-0 truncate text-ink">{item.productName} × {item.quantity}</span>
                                <span className="tabular-nums text-muted">${(item.priceAtPurchase * item.quantity).toFixed(2)}</span>
                              </li>
                            ))}
                          </ul>
                          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:max-w-sm">
                            <dt className="text-muted">Subtotal</dt>
                            <dd className="text-right tabular-nums">${order.subtotal.toFixed(2)}</dd>
                            <dt className="text-muted">Delivery fee</dt>
                            <dd className="text-right tabular-nums">{order.deliveryFee === 0 ? "Free" : `$${order.deliveryFee.toFixed(2)}`}</dd>
                            <dt className="text-muted">Weight</dt>
                            <dd className="text-right tabular-nums">{order.totalWeight.toFixed(1)} lb</dd>
                            <dt className="font-bold text-ink">Total</dt>
                            <dd className="text-right font-bold tabular-nums">${order.grandTotal.toFixed(2)}</dd>
                          </dl>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {shown.length > visibleCount && (
              <div className="border-t border-border px-5 py-4 text-center sm:px-6">
                <button
                  type="button"
                  onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                  className="rounded-full border border-border px-5 py-2 text-sm font-bold text-ink hover:bg-accent-soft"
                >
                  Show {Math.min(PAGE_SIZE, shown.length - visibleCount)} more
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
