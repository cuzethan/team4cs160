import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchNotifications, markNotificationRead, type CustomerNotification } from "./api";

const REFRESH_MS = 15000;

export function unreadCount(notifications: CustomerNotification[]) {
  return notifications.filter((notification) => !notification.isRead).length;
}

// Header "Updates" menu for customers: shows unread delivery updates on every page.
export function DeliveryUpdatesMenu() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      setNotifications(await fetchNotifications());
    } catch {
      // The menu is a convenience; keep the last list if a refresh fails.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const markRead = async (notificationId: string) => {
    await markNotificationRead(notificationId);
    setNotifications((current) => current.map((item) => item.notificationId === notificationId
      ? { ...item, isRead: true }
      : item));
  };

  const handleSelect = async (notification: CustomerNotification) => {
    setError(null);
    try {
      if (!notification.isRead) await markRead(notification.notificationId);
    } catch (readError) {
      setError((readError as Error).message);
      return;
    }
    setOpen(false);
    if (notification.orderId) navigate(`/orders/${encodeURIComponent(notification.orderId)}/tracking`);
  };

  const handleMarkAllRead = async () => {
    setError(null);
    try {
      for (const notification of notifications.filter((item) => !item.isRead)) {
        await markRead(notification.notificationId);
      }
    } catch (readError) {
      setError((readError as Error).message);
    }
  };

  const unread = unreadCount(notifications);

  return (
    <div ref={container} className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={unread > 0 ? `Delivery updates, ${unread} unread` : "Delivery updates"}
        className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2.5 text-sm font-bold text-ink hover:bg-accent-soft sm:px-4"
      >
        Updates
        {unread > 0 && (
          <span aria-hidden="true" className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-ink px-1.5 text-[11px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-white p-3 shadow-[0_12px_28px_rgba(0,0,0,0.12)]">
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            <h2 className="font-extrabold text-ink">Delivery updates</h2>
            {unread > 0 && (
              <button type="button" onClick={() => void handleMarkAllRead()} className="cursor-pointer text-xs font-bold text-accent-ink underline">
                Mark all read
              </button>
            )}
          </div>
          {error && <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}
          {notifications.length === 0 ? (
            <p className="px-1 py-3 text-sm text-muted">No updates yet.</p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {notifications.slice(0, 10).map((notification) => (
                <li key={notification.notificationId}>
                  <button
                    type="button"
                    onClick={() => void handleSelect(notification)}
                    className={`w-full cursor-pointer rounded-xl px-3 py-2.5 text-left text-sm ${notification.isRead ? "bg-canvas text-muted" : "bg-accent-soft font-semibold text-ink"}`}
                  >
                    <span>{notification.message}</span>
                    <span className="mt-1 block text-xs opacity-70">{new Date(notification.createdAt).toLocaleString()}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
