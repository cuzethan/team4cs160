import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { fetchCustomers, type Customer } from "../auth/api";
import { SiteHeader } from "../components/SiteHeader";
import { products } from "../inventory/InventoryPage";

const tabs = ["Overview", "Customers", "Inventory", "Delivery", "Robot", "Sales"] as const;
type DashboardTab = (typeof tabs)[number];
const dateRanges = ["Today", "Last week", "Last 30 days", "All time"] as const;
type DateRange = (typeof dateRanges)[number];

const chartData: Record<DateRange, { labels: string[] }> = {
  Today: {
    labels: ["8 AM", "10 AM", "12 PM", "2 PM", "4 PM", "6 PM", "8 PM"],
  },
  "Last week": {
    labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  },
  "Last 30 days": {
    labels: ["1", "5", "10", "15", "20", "25", "30"],
  },
  "All time": {
    labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"],
  },
};

const categoryCount = new Set(products.map((product) => product.category)).size;
const totalUnits = products.reduce((total, product) => total + product.quantityInStock, 0);
const lowestStockProducts = [...products]
  .sort((first, second) => first.quantityInStock - second.quantityInStock)
  .slice(0, 5);

export function ManagerDashboard() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<DashboardTab>("Overview");
  const [dateRange, setDateRange] = useState<DateRange>("Last week");

  if (loading) {
    return <main className="p-8 text-center text-[#5f6b61]" aria-live="polite">Loading your account...</main>;
  }
  if (!user || user.role !== "manager") {
    return <Navigate to={user ? "/" : "/manager-login"} replace />;
  }

  return (
    <div className="min-h-screen bg-[#fbfaf5] text-[#253b2d]">
      <SiteHeader />
      <main className="flex min-h-[calc(100vh-4.75rem)] flex-col md:flex-row md:items-stretch">
        <aside
          aria-label="Manager dashboard sections"
          className="w-full shrink-0 border-b border-[#e8e7dc] bg-white p-3 md:sticky md:top-0 md:h-[calc(100vh-4.75rem)] md:w-56 md:border-b-0 md:border-r md:px-4 md:py-5"
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

        <section className="min-w-0 flex-1 px-4 pb-8 pt-4 sm:px-6 md:pt-7" aria-live="polite">
          {activeTab === "Overview" || activeTab === "Sales" ? (
            <SalesOverview
              title={activeTab}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              showOverviewContent={activeTab === "Overview"}
            />
          ) : activeTab === "Inventory" ? (
            <InventoryPanel />
          ) : activeTab === "Customers" ? (
            <CustomersPanel />
          ) : (
            <ComingSoonPanel tab={activeTab} />
          )}
        </section>
      </main>
    </div>
  );
}

function CustomersPanel() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetchCustomers()
      .then((results) => {
        if (active) setCustomers(results);
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : "Unable to load customers.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-2xl font-extrabold text-[#294332]">Customers</h2>
        <p className="mt-1 text-sm text-[#667269]">Customer account directory.</p>
      </div>
      {loading ? (
        <p className="rounded-xl border border-[#e8e7dc] bg-white p-5 text-sm text-[#667269]" role="status">
          Loading customers...
        </p>
      ) : error ? (
        <p className="rounded-xl border border-red-200 bg-white p-5 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#e8e7dc] bg-white shadow-[0_3px_12px_rgba(42,65,48,0.04)]">
          <table className="w-full min-w-[48rem] text-left">
            <thead className="bg-[#f6f7f1] text-xs uppercase tracking-wide text-[#667269]">
              <tr>
                <th scope="col" className="px-5 py-3 font-bold">First name</th>
                <th scope="col" className="px-5 py-3 font-bold">Last name</th>
                <th scope="col" className="px-5 py-3 font-bold">Email</th>
                <th scope="col" className="px-5 py-3 font-bold">Phone</th>
                <th scope="col" className="px-5 py-3 font-bold">Status</th>
                <th scope="col" className="px-5 py-3 font-bold">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ecebe2]">
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td className="px-5 py-4 font-semibold text-[#253b2d]">{customer.firstName}</td>
                  <td className="px-5 py-4 font-semibold text-[#253b2d]">{customer.lastName}</td>
                  <td className="px-5 py-4 text-sm text-[#667269]">{customer.email}</td>
                  <td className="px-5 py-4 text-sm text-[#667269]">{customer.phone}</td>
                  <td className="px-5 py-4 text-sm capitalize text-[#667269]">{customer.accountStatus}</td>
                  <td className="px-5 py-4 text-sm text-[#667269]">
                    {new Date(customer.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-[#667269]">
                    No customer accounts found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SalesOverview({
  title,
  dateRange,
  onDateRangeChange,
  showOverviewContent,
}: {
  title: "Overview" | "Sales";
  dateRange: DateRange;
  onDateRangeChange: (dateRange: DateRange) => void;
  showOverviewContent: boolean;
}) {
  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-[#294332]">{title}</h2>
          <p className="mt-1 text-sm text-[#667269]">Sales &amp; revenue overview</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-[#426149]">
          Date range
          <select
            value={dateRange}
            onChange={(event) => onDateRangeChange(event.target.value as DateRange)}
            className="rounded-lg border border-[#dce2d5] bg-white px-3 py-2 text-[#253b2d] shadow-sm"
          >
            {dateRanges.map((range) => <option key={range}>{range}</option>)}
          </select>
        </label>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <DummyChart title="Sales" labels={chartData[dateRange].labels} />
        <DummyChart title="Revenue" labels={chartData[dateRange].labels} />
      </div>
      {showOverviewContent && (
        <div className="mt-6 flex flex-col gap-6">
          <InventoryPanel />
          <section aria-labelledby="robot-map-heading">
            <h2 id="robot-map-heading" className="text-2xl font-extrabold text-[#294332]">
              Robot
            </h2>
            <div
              role="img"
              aria-label="Blank map canvas for delivery locations"
              className="mt-1 min-h-80 rounded-2xl border border-[#e8e7dc] bg-white shadow-[0_3px_12px_rgba(42,65,48,0.04)]"
            />
          </section>
        </div>
      )}
    </>
  );
}

function DummyChart({
  title,
  labels,
}: {
  title: string;
  labels: string[];
}) {
  return (
    <section
      aria-label={`${title} chart placeholder`}
      className="min-w-0 rounded-2xl border border-[#e8e7dc] bg-white p-4 shadow-[0_3px_12px_rgba(42,65,48,0.04)] sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold text-[#294332]">{title}</h2>
        <span className="rounded-full bg-[#f6f7f1] px-2.5 py-1 text-xs font-bold text-[#7d887b]"></span>
      </div>
      <svg
        viewBox="0 0 640 220"
        role="img"
        aria-label={`Empty ${title.toLowerCase()} graph with date labels ${labels.join(", ")}`}
        className="mt-3 w-full overflow-visible"
      >
        {[40, 84, 128, 172].map((y) => (
          <line key={y} x1="40" x2="600" y1={y} y2={y} stroke="#ecebe2" strokeDasharray="4 5" />
        ))}
        {labels.map((label, index) => (
          <text
            key={label}
            x={42 + index * (556 / (labels.length - 1))}
            y="205"
            textAnchor="middle"
            fill="#7d887b"
            fontSize="12"
          >
            {label}
          </text>
        ))}
      </svg>
    </section>
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

function ComingSoonPanel({ tab }: { tab: "Delivery" | "Robot" | "Revenue" }) {
  const descriptions: Record<"Delivery" | "Robot" | "Revenue", string> = {
    Delivery: "Delivery queues and order status will be available here.",
    Robot: "Robot status and fleet controls will be available here.",
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
