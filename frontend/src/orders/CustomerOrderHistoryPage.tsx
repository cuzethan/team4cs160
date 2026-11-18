import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { SiteHeader } from "../components/SiteHeader";
import { confirmOrderReceived, fetchMyOrders as fetchMyOrdersRequest, fetchOrderTracking } from "./api";
import { fetchNotifications, markNotificationRead, type CustomerNotification } from "../notifications/api";
import { addToCart, fetchCart } from "../cart/api";
import { fetchProducts } from "../inventory/api";
import { OrderCard } from "./OrderCard";
import { planReorder } from "./reorder";
import type { CustomerOrder } from "./types";

export function CustomerOrderHistoryPage() {
  const location = useLocation();
  const navigate = useNavigate();
  // Set by the checkout page right after an order goes through.
  const placedOrderId = (location.state as { placedOrderId?: string } | null)?.placedOrderId;
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [receiptPending, setReceiptPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [buyAgainPending, setBuyAgainPending] = useState<string | null>(null);
  const [reorderNotice, setReorderNotice] = useState<{ text: string; addedAny: boolean } | null>(null);

  const refreshOrders = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    if (showLoading) setError(null);
    try {
      const fetchedOrders = await fetchMyOrdersRequest();
      const trackedOrders = await Promise.all(fetchedOrders.map(async (order) => {
        if (order.status !== "out_for_delivery") return order;
        try {
          const tracking = await fetchOrderTracking(order.id);
          return { ...order, deliveryStatus: tracking.deliveryStatus };
        } catch {
          return order;
        }
      }));
      setOrders(trackedOrders);
    } catch (fetchError) {
      if (showLoading) setError((fetchError as Error).message);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshOrders(true);
    const timer = window.setInterval(() => void refreshOrders(), 5000);
    return () => window.clearInterval(timer);
  }, [refreshOrders]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const next = await fetchNotifications();
        if (active) setNotifications(next);
      } catch {
        // Notifications are helpful context; order history remains usable if they fail.
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const handleConfirmReceived = async (orderId: string) => {
    setReceiptPending(orderId);
    setActionError(null);
    try {
      await confirmOrderReceived(orderId);
      await refreshOrders();
      setNotifications(await fetchNotifications());
    } catch (confirmError) {
      setActionError((confirmError as Error).message);
    } finally {
      setReceiptPending(null);
    }
  };

  const handleBuyAgain = async (order: CustomerOrder) => {
    setBuyAgainPending(order.id);
    setActionError(null);
    setReorderNotice(null);
    try {
      const [products, cart] = await Promise.all([fetchProducts(), fetchCart()]);
      const plan = planReorder(order.items, products, cart);
      const added: string[] = [];
      const failed: string[] = [...plan.skipped];
      for (const line of plan.toAdd) {
        try {
          await addToCart(line.productId, line.quantity);
          added.push(line.name);
        } catch {
          failed.push(line.name);
        }
      }
      const parts: string[] = [];
      if (added.length > 0) parts.push(`Added ${added.length} item${added.length === 1 ? "" : "s"} to your cart.`);
      const reduced = plan.reduced.filter((name) => added.includes(name));
      if (reduced.length > 0) parts.push(`Fewer than before because of low stock: ${reduced.join(", ")}.`);
      if (failed.length > 0) parts.push(`Not available right now: ${failed.join(", ")}.`);
      setReorderNotice({ text: parts.join(" "), addedAny: added.length > 0 });
    } catch (reorderError) {
      setActionError((reorderError as Error).message);
    } finally {
      setBuyAgainPending(null);
    }
  };

  const handleTrackingClick = (orderId: string) => {
    navigate(`/orders/${encodeURIComponent(orderId)}/tracking`);
  };

  const handleNotificationClick = async (notification: CustomerNotification) => {
    if (!notification.isRead) {
      try {
        await markNotificationRead(notification.notificationId);
        setNotifications((current) => current.map((item) => item.notificationId === notification.notificationId
          ? { ...item, isRead: true }
          : item));
      } catch (readError) {
        setActionError((readError as Error).message);
      }
    }
    if (notification.orderId) handleTrackingClick(notification.orderId);
  };

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
        <div className="mb-8">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-muted">Your account</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">Order history</h1>
          <p className="mt-3 max-w-2xl text-muted">Review your past purchases and check the status of current deliveries.</p>
        </div>

        {placedOrderId && (
          <p role="status" className="mb-6 rounded-2xl bg-accent-soft px-6 py-4 font-semibold text-accent-ink">
            Thanks! Order #{placedOrderId.slice(0, 8).toUpperCase()} has been placed.
          </p>
        )}

        {notifications.length > 0 && (
          <section aria-label="Delivery notifications" className="mb-6 rounded-2xl border border-border bg-white p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-extrabold text-ink">Delivery updates</h2>
              <span className="text-xs font-bold text-muted">{notifications.filter((notification) => !notification.isRead).length} unread</span>
            </div>
            <ul className="space-y-2">
              {notifications.slice(0, 5).map((notification) => (
                <li key={notification.notificationId}>
                  <button type="button" onClick={() => void handleNotificationClick(notification)} className={`w-full rounded-xl px-4 py-3 text-left text-sm ${notification.isRead ? "bg-canvas text-muted" : "bg-accent-soft font-semibold text-accent-ink"}`}>
                    <span>{notification.message}</span>
                    <span className="mt-1 block text-xs opacity-70">{new Date(notification.createdAt).toLocaleString()}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {reorderNotice && (
          <p role="status" className="mb-5 rounded-xl border border-border bg-accent-soft px-4 py-3 text-sm font-semibold text-ink">
            {reorderNotice.text}{" "}
            {reorderNotice.addedAny && <Link to="/cart" className="underline">View cart</Link>}
          </p>
        )}

        {actionError && <p role="alert" className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{actionError}</p>}

        {isLoading ? (
          <p role="status" className="rounded-2xl bg-white p-6 text-muted">Loading your orders…</p>
        ) : error ? (
          <section role="alert" className="rounded-2xl border border-red-200 bg-white p-6">
            <p className="text-red-800">{error}</p>
            <button type="button" onClick={() => void refreshOrders(true)} className="mt-4 font-bold text-accent-ink underline">Try again</button>
          </section>
        ) : orders.length === 0 ? (
          <section className="rounded-2xl border border-border bg-white p-8 text-center">
            <h2 className="text-lg font-bold">No orders yet</h2>
            <p className="mt-2 text-muted">Your completed purchases will appear here.</p>
          </section>
        ) : (
          <section aria-label="Your orders" className="space-y-4">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} onTrackClick={handleTrackingClick} onConfirmReceived={(id) => void handleConfirmReceived(id)} receiptPending={receiptPending === order.id} onBuyAgain={(target) => void handleBuyAgain(target)} buyAgainPending={buyAgainPending === order.id} />
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
