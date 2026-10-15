import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { fetchCustomers, type Customer } from "../auth/api";
import { SiteHeader } from "../components/SiteHeader";
import { useProducts } from "../inventory/useProducts";
import { fetchDeliveries, fetchSales, type ManagerDelivery, type SalesBucket, type SalesRange } from "./api";

const tabs = ["Overview", "Customers", "Inventory", "Delivery", "Robot", "Sales"] as const;
type DashboardTab = (typeof tabs)[number];
const dateRanges = ["Today", "Last week", "Last 30 days", "All time"] as const;
type DateRange = (typeof dateRanges)[number];

const salesRangeFor: Record<DateRange, SalesRange> = {
  Today: "today",
  "Last week": "week",
  "Last 30 days": "month",
  "All time": "all",
};

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
          ) : activeTab === "Delivery" ? (
            <DeliveriesPanel />
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

function DeliveriesPanel() {
  const [deliveries, setDeliveries] = useState<ManagerDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetchDeliveries()
      .then((results) => {
        if (active) setDeliveries(results);
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : "Unable to load deliveries.");
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
        <h2 className="text-2xl font-extrabold text-[#294332]">Delivery</h2>
        <p className="mt-1 text-sm text-[#667269]">Orders and delivery progress.</p>
      </div>
      {loading ? (
        <p className="rounded-xl border border-[#e8e7dc] bg-white p-5 text-sm text-[#667269]" role="status">
          Loading deliveries...
        </p>
      ) : error ? (
        <p className="rounded-xl border border-red-200 bg-white p-5 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#e8e7dc] bg-white shadow-[0_3px_12px_rgba(42,65,48,0.04)]">
          <table className="w-full min-w-[44rem] text-left">
            <thead className="bg-[#f6f7f1] text-xs uppercase tracking-wide text-[#667269]">
              <tr>
                <th scope="col" className="px-5 py-3 font-bold">Order ID</th>
                <th scope="col" className="px-5 py-3 font-bold">Customer</th>
                <th scope="col" className="px-5 py-3 font-bold">Delivery progress</th>
                <th scope="col" className="px-5 py-3 font-bold">ETA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ecebe2]">
              {deliveries.map((delivery) => (
                <tr key={delivery.orderId}>
                  <th scope="row" className="px-5 py-4 font-mono text-xs text-[#253b2d]">{delivery.orderId}</th>
                  <td className="px-5 py-4 font-semibold text-[#253b2d]">{delivery.customerName}</td>
                  <td className="px-5 py-4 text-sm capitalize text-[#667269]">{delivery.deliveryProgress}</td>
                  <td className="px-5 py-4 text-sm text-[#667269]">
                    {delivery.eta ? new Date(delivery.eta).toLocaleString() : "Not scheduled"}
                  </td>
                </tr>
              ))}
              {deliveries.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-sm text-[#667269]">
                    No orders to deliver yet.
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
  const [sales, setSales] = useState<SalesBucket[]>([]);
  const [salesLoading, setSalesLoading] = useState(true);
  const [salesError, setSalesError] = useState("");

  useEffect(() => {
    let active = true;
    setSalesLoading(true);
    setSalesError("");
    fetchSales(salesRangeFor[dateRange])
      .then((buckets) => {
        if (active) setSales(buckets);
      })
      .catch((requestError: unknown) => {
        if (active) setSalesError(requestError instanceof Error ? requestError.message : "Unable to load sales data.");
      })
      .finally(() => {
        if (active) setSalesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [dateRange]);

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
      {salesLoading ? (
        <p role="status" className="rounded-xl border border-[#e8e7dc] bg-white p-5 text-sm text-[#667269]">Loading sales data...</p>
      ) : salesError ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-white p-5 text-sm text-red-700">{salesError}</p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <SalesChart title="Paid orders" buckets={sales} range={salesRangeFor[dateRange]} metric="paidOrders" />
          <SalesChart title="Payment revenue" buckets={sales} range={salesRangeFor[dateRange]} metric="revenue" />
        </div>
      )}
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

function SalesChart({
  title,
  buckets,
  range,
  metric,
}: {
  title: string;
  buckets: SalesBucket[];
  range: SalesRange;
  metric: "paidOrders" | "revenue";
}) {
  const values = buckets.map((bucket) => bucket[metric]);
  const maximum = Math.max(...values, 1);
  const points = values.map((value, index) => ({
    x: 54 + (index / Math.max(values.length - 1, 1)) * 556,
    y: 174 - (value / maximum) * 142,
  }));
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const labelInterval = Math.max(1, Math.ceil(buckets.length / 7));
  const hasSales = values.some((value) => value > 0);
  const formatValue = (value: number) => metric === "revenue"
    ? `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)}`
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);

  return (
    <section
      aria-label={`${title} chart`}
      className="min-w-0 rounded-2xl border border-[#e8e7dc] bg-white p-4 shadow-[0_3px_12px_rgba(42,65,48,0.04)] sm:p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold text-[#294332]">{title}</h2>
        <span className="text-sm font-bold tabular-nums text-[#426149]">
          {metric === "revenue" ? `$${values.reduce((sum, value) => sum + value, 0).toFixed(2)}` : values.reduce((sum, value) => sum + value, 0)}
        </span>
      </div>
      <svg
        viewBox="0 0 640 220"
        role="img"
        aria-label={`${title} graph for ${range}, showing ${buckets.length} time buckets`}
        className="mt-3 w-full"
      >
        {[0, 1, 2, 3].map((tick) => {
          const y = 32 + tick * (142 / 3);
          const value = maximum * (1 - tick / 3);
          return (
            <g key={tick}>
              <line x1="52" x2="612" y1={y} y2={y} stroke="#ecebe2" strokeDasharray="4 5" />
              <text x="44" y={y + 4} textAnchor="end" fill="#7d887b" fontSize="11">{formatValue(value)}</text>
            </g>
          );
        })}
        {points.length > 0 && (
          <path d={line} fill="none" stroke="#438254" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {buckets.map((bucket, index) => index % labelInterval === 0 || index === buckets.length - 1 ? (
          <text key={bucket.bucketStart} x={points[index].x} y="202" textAnchor="middle" fill="#7d887b" fontSize="11">
            {formatBucketLabel(bucket.bucketStart, range)}
          </text>
        ) : null)}
        {!hasSales && (
          <text x="332" y="112" textAnchor="middle" fill="#7d887b" fontSize="13">No paid sales in this range</text>
        )}
      </svg>
    </section>
  );
}

function formatBucketLabel(bucketStart: string, range: SalesRange) {
  const date = new Date(bucketStart);
  if (range === "today") return date.toLocaleTimeString([], { hour: "numeric" });
  if (range === "all") return date.toLocaleDateString([], { month: "short", year: "2-digit" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function InventoryPanel() {
  const { products, isLoading, error } = useProducts();
  const categoryCount = new Set(products.map((product) => product.category)).size;
  const totalUnits = products.reduce((total, product) => total + product.quantityInStock, 0);
  const lowestStockProducts = [...products]
    .sort((first, second) => first.quantityInStock - second.quantityInStock)
    .slice(0, 5);

  if (isLoading) {
    return <p role="status" className="rounded-2xl bg-white p-6 text-[#5f6b61]">Loading inventory…</p>;
  }
  if (error) {
    return <p role="alert" className="rounded-2xl border border-red-200 bg-white p-6 text-red-800">{error}</p>;
  }

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

function ComingSoonPanel({ tab }: { tab: "Robot" | "Revenue" }) {
  const descriptions: Record<"Robot" | "Revenue", string> = {
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
