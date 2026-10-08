import { useEffect, useState } from "react";
import { SiteHeader } from "../components/SiteHeader";
import { OrderCard } from "./OrderCard";
import type { CustomerOrder } from "./types";

const mockOrders: CustomerOrder[] = [
  {
    id: "ORD-1048",
    date: "2026-09-23T15:30:00.000Z",
    status: "out_for_delivery",
    deliveryStatus: "out_for_delivery",
    grandTotal: 6.73,
    items: [
      { order_item_id: "item-1048-1", order_id: "ORD-1048", product_id: "apple-gala", productName: "Gala Apples", quantity: 2, price_at_purchase: 1.49, weight_at_purchase: 1 },
      { order_item_id: "item-1048-2", order_id: "ORD-1048", product_id: "avocado", productName: "Hass Avocados", quantity: 3, price_at_purchase: 1.25, weight_at_purchase: 0.4 },
    ],
  },
  {
    id: "ORD-1032",
    date: "2026-09-17T18:10:00.000Z",
    status: "delivered",
    deliveryStatus: "delivered",
    grandTotal: 12.77,
    items: [
      { order_item_id: "item-1032-1", order_id: "ORD-1032", product_id: "strawberry", productName: "Fresh Strawberries", quantity: 2, price_at_purchase: 4.29, weight_at_purchase: 1 },
      { order_item_id: "item-1032-2", order_id: "ORD-1032", product_id: "bread", productName: "Whole Grain Bread", quantity: 1, price_at_purchase: 4.19, weight_at_purchase: 1.2 },
    ],
  },
  {
    id: "ORD-1016",
    date: "2026-09-09T11:45:00.000Z",
    status: "completed",
    deliveryStatus: "confirmed",
    grandTotal: 8.48,
    items: [
      { order_item_id: "item-1016-1", order_id: "ORD-1016", product_id: "broccoli", productName: "Green Broccoli", quantity: 2, price_at_purchase: 2.49, weight_at_purchase: 0.8 },
      { order_item_id: "item-1016-2", order_id: "ORD-1016", product_id: "rice", productName: "Jasmine Rice", quantity: 1, price_at_purchase: 3.5, weight_at_purchase: 2 },
    ],
  },
];

export function CustomerOrderHistoryPage() {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMyOrders = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Replace with GET /api/orders/mine when the orders API is available.
      const response = { orders: mockOrders.map((order) => ({ ...order, items: [...order.items] })) };
      setOrders(response.orders);
    } catch {
      setError("We couldn't load your orders. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchMyOrders();
  }, []);

  const handleConfirmReceived = (_orderId: string) => {
    // Confirmation stays a no-op until the order API is available.
  };

  const handleTrackingClick = (_orderId: string) => {
    // Tracking stays a no-op until a delivery tracking page is available.
  };

  return (
    <div className="min-h-screen bg-[#fbfaf5] text-[#253b2d]">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
        <div className="mb-8">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#7d887b]">Your account</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-[#294332] sm:text-5xl">Order history</h1>
          <p className="mt-3 max-w-2xl text-[#667269]">Review your past purchases and check the status of current deliveries.</p>
        </div>

        {isLoading ? (
          <p role="status" className="rounded-2xl bg-white p-6 text-[#5f6b61]">Loading your orders…</p>
        ) : error ? (
          <section role="alert" className="rounded-2xl border border-red-200 bg-white p-6">
            <p className="text-red-800">{error}</p>
            <button type="button" onClick={() => void fetchMyOrders()} className="mt-4 font-bold text-[#416449] underline">Try again</button>
          </section>
        ) : orders.length === 0 ? (
          <section className="rounded-2xl border border-[#e8e7dc] bg-white p-8 text-center">
            <h2 className="text-lg font-bold">No orders yet</h2>
            <p className="mt-2 text-[#667269]">Your completed purchases will appear here.</p>
          </section>
        ) : (
          <section aria-label="Your orders" className="space-y-4">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} onTrackClick={handleTrackingClick} onConfirmReceived={handleConfirmReceived} />
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
