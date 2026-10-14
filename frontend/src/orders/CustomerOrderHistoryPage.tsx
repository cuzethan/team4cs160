import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { SiteHeader } from "../components/SiteHeader";
import { fetchMyOrders as fetchMyOrdersRequest } from "./api";
import { OrderCard } from "./OrderCard";
import type { CustomerOrder } from "./types";

export function CustomerOrderHistoryPage() {
  const location = useLocation();
  // Set by the checkout page right after an order goes through.
  const placedOrderId = (location.state as { placedOrderId?: string } | null)?.placedOrderId;
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMyOrders = async () => {
    setIsLoading(true);
    setError(null);
    try {
      setOrders(await fetchMyOrdersRequest());
    } catch (fetchError) {
      setError((fetchError as Error).message);
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

        {placedOrderId && (
          <p role="status" className="mb-6 rounded-2xl bg-[#e9f1df] px-6 py-4 font-semibold text-[#416449]">
            Thanks! Order #{placedOrderId.slice(0, 8).toUpperCase()} has been placed.
          </p>
        )}

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
