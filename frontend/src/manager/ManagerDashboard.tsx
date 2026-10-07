import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { SiteHeader } from "../components/SiteHeader";
import { products } from "../inventory/InventoryPage";

const tabs = ["Customers", "Inventory", "Delivery", "Robot", "Sales", "Revenue"] as const;
type DashboardTab = (typeof tabs)[number];

const categoryCount = new Set(products.map((product) => product.category)).size;
const totalUnits = products.reduce((total, product) => total + product.quantityInStock, 0);
const lowestStockProducts = [...products]
  .sort((first, second) => first.quantityInStock - second.quantityInStock)
  .slice(0, 5);

export function ManagerDashboard() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<DashboardTab>("Inventory");

  if (loading) {
    return <main className="p-8 text-center text-[#5f6b61]" aria-live="polite">Loading your account...</main>;
  }
  if (!user || user.role !== "manager") {
    return <Navigate to={user ? "/" : "/manager-login"} replace />;
  }

  return (
    <div className="min-h-screen bg-[#fbfaf5] text-[#253b2d]">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          <aside
            aria-label="Manager dashboard sections"
            className="w-full shrink-0 rounded-2xl border border-[#e8e7dc] bg-white p-3 shadow-[0_3px_12px_rgba(42,65,48,0.04)] md:sticky md:top-6 md:w-56"
          >
            <p className="px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[#899188]">
              Operations
            </p>
            <nav aria-label="Dashboard tabs" className="flex gap-1 overflow-x-auto md:flex-col">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  aria-current={activeTab === tab ? "page" : undefined}
                  onClick={() => setActiveTab(tab)}
                  className={`shrink-0 rounded-xl px-3 py-3 text-left text-sm font-bold transition md:w-full ${
                    activeTab === tab
                      ? "bg-[#e9f1df] text-[#2e4935]"
                      : "text-[#667269] hover:bg-[#f6f7f1] hover:text-[#2e4935]"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </nav>
          </aside>

          <section className="min-w-0 flex-1" aria-live="polite">
            {activeTab === "Inventory" ? (
              <InventoryPanel />
            ) : (
              <ComingSoonPanel tab={activeTab} />
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function InventoryPanel() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-[#294332]">Inventory</h2>
          <p className="mt-1 text-sm text-[#667269]">Catalog and stock overview.</p>
        </div>
        <Link
          to="/inventory"
          className="rounded-full bg-[#2e4935] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#253b2d]"
        >
          Open product catalog
        </Link>
      </div>

      <section aria-label="Catalog overview" className="grid gap-4 sm:grid-cols-3">
        <OverviewCard label="Catalog products" value={products.length} detail="Products currently listed" />
        <OverviewCard label="Categories" value={categoryCount} detail="Across the catalog" />
        <OverviewCard label="Units in stock" value={totalUnits} detail="Combined listed quantities" />
      </section>

      <section
        aria-labelledby="stock-heading"
        className="overflow-hidden rounded-2xl border border-[#e8e7dc] bg-white shadow-[0_3px_12px_rgba(42,65,48,0.04)]"
      >
        <div className="border-b border-[#ecebe2] px-5 py-5 sm:px-7">
          <h3 id="stock-heading" className="text-xl font-extrabold text-[#294332]">
            Lowest stock in catalog
          </h3>
          <p className="mt-1 text-sm text-[#667269]">
            Items with the fewest listed units, shown for a quick inventory check.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left">
            <thead className="bg-[#f6f7f1] text-xs uppercase tracking-wide text-[#667269]">
              <tr>
                <th scope="col" className="px-5 py-3 font-bold sm:px-7">Product</th>
                <th scope="col" className="px-5 py-3 font-bold">Category</th>
                <th scope="col" className="px-5 py-3 text-right font-bold sm:px-7">Units listed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ecebe2]">
              {lowestStockProducts.map((product) => (
                <tr key={product.id}>
                  <th scope="row" className="px-5 py-4 font-semibold text-[#253b2d] sm:px-7">
                    <span aria-hidden="true" className="mr-2">{product.emoji}</span>
                    {product.name}
                  </th>
                  <td className="px-5 py-4 text-sm text-[#667269]">{product.category}</td>
                  <td className="px-5 py-4 text-right font-bold tabular-nums text-[#253b2d] sm:px-7">
                    {product.quantityInStock}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ComingSoonPanel({ tab }: { tab: DashboardTab }) {
  const descriptions: Record<Exclude<DashboardTab, "Inventory">, string> = {
    Customers: "Customer records and account activity will be available here.",
    Delivery: "Delivery queues and order status will be available here.",
    Robot: "Robot status and fleet controls will be available here.",
    Sales: "Sales reports will be available here when order reporting is connected.",
    Revenue: "Revenue reports will be available here when payment reporting is connected.",
  };

  return (
    <div className="rounded-2xl border border-[#e8e7dc] bg-white p-6 shadow-[0_3px_12px_rgba(42,65,48,0.04)] sm:p-8">
      <h2 className="text-2xl font-extrabold text-[#294332]">{tab}</h2>
      <p className="mt-2 text-[#667269]">{descriptions[tab]}</p>
      <p className="mt-5 rounded-xl bg-[#f6f7f1] px-4 py-3 text-sm text-[#667269]">
        This section does not have connected data yet.
      </p>
    </div>
  );
}

function OverviewCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <article className="rounded-2xl border border-[#e8e7dc] bg-white p-5 shadow-[0_3px_12px_rgba(42,65,48,0.04)]">
      <p className="text-sm font-bold text-[#667269]">{label}</p>
      <p className="mt-2 text-3xl font-extrabold tabular-nums text-[#294332]">{value}</p>
      <p className="mt-1 text-sm text-[#7d887b]">{detail}</p>
    </article>
  );
}
