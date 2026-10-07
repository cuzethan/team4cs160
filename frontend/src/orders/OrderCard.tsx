import { useState } from "react";
import { OrderDetails } from "./OrderDetails";
import type { CustomerOrder } from "./types";

type OrderCardProps = {
  order: CustomerOrder;
  onTrackClick?: (orderId: string) => void;
  onConfirmReceived?: (orderId: string) => void;
};

export function OrderCard({ order, onTrackClick, onConfirmReceived }: OrderCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleTrackClick = () => onTrackClick?.(order.id);
  const handleConfirmReceivedClick = () => onConfirmReceived?.(order.id);

  const displayDate = new Date(order.date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <article className="overflow-hidden rounded-2xl border border-[#e8e7dc] bg-white shadow-[0_3px_12px_rgba(42,65,48,0.04)]">
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((expanded) => !expanded)}
        className="block w-full px-5 py-5 text-left transition hover:bg-[#fffefa] focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-emerald-700 sm:px-6"
      >
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#7d887b]">Order</p>
            <h2 className="mt-1 text-lg font-extrabold text-[#294332]">#{order.id}</h2>
            <p className="mt-1 text-sm text-[#788078]">Placed {displayDate}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#e9f1df] px-3 py-1.5 text-xs font-bold capitalize text-[#416449]">
              {order.status.replaceAll("_", " ")}
            </span>
            <span aria-hidden="true" className="ml-1 text-lg text-[#788078]">{isExpanded ? "−" : "+"}</span>
          </div>
        </div>

      </button>

      <div className="px-5 pb-5 sm:px-6">
        <ul className="space-y-1 border-t border-[#ecebe2] pt-4 text-sm text-[#5f6b61]">
          {order.items.map((item) => (
            <li key={item.order_item_id} className="flex justify-between gap-4">
              <span>{item.productName} <span className="text-[#899188">× {item.quantity}</span></span>
              <span className="shrink-0">${(item.price_at_purchase * item.quantity).toFixed(2)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex justify-between gap-4 border-t border-[#ecebe2] pt-4">
          <span className="text-sm font-bold text-[#667269]">Grand total</span>
          <span className="font-extrabold text-[#253b2d]">${order.grandTotal.toFixed(2)}</span>
        </div>
      </div>

      {(order.status === "out_for_delivery" || order.deliveryStatus === "delivered") && (
        <div className="flex flex-wrap justify-end gap-3 border-t border-[#ecebe2] px-5 py-4 sm:px-6">
          {order.status === "out_for_delivery" && (
            <button
              type="button"
              onClick={handleTrackClick}
              className="rounded-full border-2 border-[#2e4935] px-5 py-2 text-sm font-bold text-[#2e4935] transition hover:bg-[#2e4935] hover:text-white"
            >
              Track Delivery
            </button>
          )}
          {order.deliveryStatus === "delivered" && (
            <button
              type="button"
              onClick={handleConfirmReceivedClick}
              className="rounded-full bg-[#416449] px-5 py-2 text-sm font-bold text-white transition hover:bg-[#35563c]"
            >
              Order Received
            </button>
          )}
        </div>
      )}

      {isExpanded && <OrderDetails order={order} />}
    </article>
  );
}
