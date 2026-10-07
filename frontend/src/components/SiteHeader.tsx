import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

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
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-[0_20px_40px_rgba(42,65,48,0.25)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="logout-title" className="text-xl font-extrabold text-[#294332]">
          Are you sure you want to log out?
        </h2>
        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelButton}
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded-full border border-[#e5e7dc] bg-white px-5 py-2.5 text-sm font-bold text-[#426149] hover:bg-[#f0f3e8]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="cursor-pointer rounded-full bg-[#2e4935] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#253b2d]"
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
    <header className="border-b border-[#ecebe2] bg-[#fffefa]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Link
          to="/"
          className="text-lg font-extrabold tracking-tight text-[#2e4935]"
          aria-label="OFS home"
        >
          OFS
        </Link>
        <nav aria-label="Main" className="flex items-center gap-2 sm:gap-3">
          <Link
            to="/inventory"
            className="rounded-full px-4 py-2.5 text-sm font-bold text-[#426149] hover:bg-[#f0f3e8]"
          >
            Shop
          </Link>
          {user ? (
            <>
              <span className="flex items-center gap-2 rounded-full bg-[#eef6e8] px-3 py-2 text-sm font-bold text-[#2e4935]">
                <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full bg-[#2e4935] text-xs text-white">
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
                className="cursor-pointer rounded-full px-4 py-2.5 text-sm font-bold text-[#426149] hover:bg-[#f0f3e8]"
              >
                Log out
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="rounded-full px-4 py-2.5 text-sm font-bold text-[#426149] hover:bg-[#f0f3e8]"
            >
              Log in
            </Link>
          )}
          <button
            type="button"
            className="flex h-11 items-center gap-2 rounded-full border border-[#e5e7dc] bg-white px-4 text-sm font-bold text-[#426149] shadow-sm"
          >
            <span aria-hidden="true">🛒</span>
            <span className="hidden sm:inline">Your cart</span>
          </button>
        </nav>
      </div>
      {confirmingLogout && (
        <LogoutConfirm onCancel={() => setConfirmingLogout(false)} onConfirm={handleLogout} />
      )}
    </header>
  );
}
