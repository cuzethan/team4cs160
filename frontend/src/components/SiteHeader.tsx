import { Link } from "react-router-dom";

export function SiteHeader() {
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
          <Link
            to="/login"
            className="rounded-full px-4 py-2.5 text-sm font-bold text-[#426149] hover:bg-[#f0f3e8]"
          >
            Log in
          </Link>
          <button
            type="button"
            className="flex h-11 items-center gap-2 rounded-full border border-[#e5e7dc] bg-white px-4 text-sm font-bold text-[#426149] shadow-sm"
          >
            <span aria-hidden="true">🛒</span>
            <span className="hidden sm:inline">Your cart</span>
          </button>
        </nav>
      </div>
    </header>
  );
}
