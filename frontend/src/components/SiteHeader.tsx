import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { DeliveryUpdatesMenu } from "../notifications/DeliveryUpdatesMenu";
import { OfsLogo } from "./OfsLogo";

function LogoutConfirm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const cancelButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="logout-title"
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-[0_20px_40px_rgba(0,0,0,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="logout-title" className="text-xl font-extrabold text-ink">
          Are you sure you want to log out?
        </h2>
        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelButton}
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded-full border border-border bg-white px-5 py-2.5 text-sm font-bold text-ink hover:bg-accent-soft"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="cursor-pointer rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-on-accent hover:bg-accent-hover"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}

export function SiteHeader() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  const handleLogout = async () => {
    setConfirmingLogout(false);
    await logout();
    navigate("/", { state: { notice: "You have been logged out." } });
  };

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Link
          to="/"
          className="inline-flex items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
          aria-label="OFS home"
        >
          <OfsLogo className="h-8 w-auto sm:h-9" />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-3">
          <Link
            to={user?.role === "manager" ? "/manager-dashboard" : "/inventory"}
            className="whitespace-nowrap rounded-full px-3 py-2.5 text-sm font-bold text-ink hover:bg-accent-soft sm:px-4"
          >
            {user?.role === "manager" ? "Dashboard" : "Shop"}
          </Link>
          {user?.role === "customer" && (
            <Link
              to="/orders"
              className="whitespace-nowrap rounded-full px-3 py-2.5 text-sm font-bold text-ink hover:bg-accent-soft sm:px-4"
            >
              <span className="sm:hidden">Orders</span>
              <span className="hidden sm:inline">Order history</span>
            </Link>
          )}
          {user?.role === "manager" && (
            // The shop pages as customers see them, with the manager's quick stock controls.
            <Link
              to="/inventory"
              className="whitespace-nowrap rounded-full px-3 py-2.5 text-sm font-bold text-ink hover:bg-accent-soft sm:px-4"
            >
              View store
            </Link>
          )}
          {user?.role === "customer" && <DeliveryUpdatesMenu />}
          {user ? (
            <>
              {/* Hidden on phones to leave room for the links. */}
              <span className="hidden items-center gap-2 rounded-full bg-accent-soft px-3 py-2 text-sm font-bold text-ink sm:flex">
                <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs text-white">
                  {user.firstName.charAt(0).toUpperCase()}
                </span>
                <span className="hidden sm:inline">
                  {user.firstName}
                  {user.role === "manager" ? " (Manager)" : ""}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setConfirmingLogout(true)}
                className="cursor-pointer whitespace-nowrap rounded-full px-3 py-2.5 text-sm font-bold text-ink hover:bg-accent-soft sm:px-4"
              >
                Log out
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="whitespace-nowrap rounded-full px-3 py-2.5 text-sm font-bold text-ink hover:bg-accent-soft sm:px-4"
            >
              Log in
            </Link>
          )}
          {/* Managers can't shop, so they don't get a cart. */}
          {user?.role !== "manager" && (
            <Link
              to="/cart"
              className="flex h-11 items-center gap-2 rounded-full border border-border bg-white px-4 text-sm font-bold text-ink shadow-sm transition hover:border-accent-ink hover:bg-accent-soft"
            >
              <span aria-hidden="true">🛒</span>
              <span className="hidden sm:inline">Your cart</span>
            </Link>
          )}
        </nav>
      </div>
      {confirmingLogout && (
        <LogoutConfirm onCancel={() => setConfirmingLogout(false)} onConfirm={handleLogout} />
      )}
    </header>
  );
}
