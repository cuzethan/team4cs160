import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { fetchCustomers, type Customer } from "../auth/api";
import { SiteHeader } from "../components/SiteHeader";
import { emojiFor } from "../inventory/api";
import type { InventoryProduct } from "../inventory/types";
import { fetchDeliveries, fetchDeliverySettings, fetchManagedInventory, fetchSales, saveDeliverySettings, updateProduct, type DeliverySettings, type ManagedProduct, type ManagerDelivery, type ProductCategory, type SalesBucket, type SalesRange } from "./api";
import { ProductFormDialog, ProductTable } from "./ProductManager";

const tabs = ["Overview", "Customers", "Inventory", "Delivery", "Robot", "Sales", "Settings"] as const;
type DashboardTab = (typeof tabs)[number];

// Sidebar sections. A null heading means the tab stands on its own.
const tabGroups: { heading: string | null; tabs: DashboardTab[] }[] = [
  { heading: null, tabs: ["Overview"] },
  { heading: "Store", tabs: ["Inventory", "Customers"] },
  { heading: "Orders", tabs: ["Delivery", "Robot"] },
  { heading: "Reports", tabs: ["Sales"] },
  { heading: null, tabs: ["Settings"] },
];

// Products at or below this count are listed as running low.
const LOW_STOCK = 10;
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
  // The open tab lives in the URL (?tab=inventory) so refresh and Back keep it.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = tabs.find((tab) => tab.toLowerCase() === searchParams.get("tab")) ?? "Overview";
  const setActiveTab = (tab: DashboardTab) =>
    setSearchParams(tab === "Overview" ? {} : { tab: tab.toLowerCase() });
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
          className="w-full shrink-0 border-b border-[#e8e7dc] bg-white p-3 md:sticky md:top-0 md:h-[calc(100vh-4.75rem)] md:w-56 md:overflow-y-auto md:border-b-0 md:border-r md:px-4 md:py-5"
        >
          <nav aria-label="Dashboard tabs" className="flex gap-1 overflow-x-auto md:flex-col md:gap-4">
            {tabGroups.map((group) => (
              <div key={group.heading ?? group.tabs[0]} className="flex shrink-0 gap-1 md:flex-col">
                {group.heading && (
                  <p className="hidden px-3 pb-1 text-xs font-bold uppercase tracking-[0.14em] text-[#899188] md:block">
                    {group.heading}
                  </p>
                )}
                {group.tabs.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    aria-current={activeTab === tab ? "page" : undefined}
                    onClick={() => setActiveTab(tab)}
                    className={`shrink-0 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition md:w-full ${
                      activeTab === tab
                        ? "bg-[#e9f1df] text-[#2e4935]"
                        : "text-[#667269] hover:bg-[#f6f7f1] hover:text-[#2e4935]"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        <section className="min-w-0 flex-1 px-4 pb-8 pt-4 sm:px-6 md:pt-7" aria-live="polite">
          {activeTab === "Overview" ? (
            <OverviewPanel onOpenTab={setActiveTab} />
          ) : activeTab === "Sales" ? (
            <SalesOverview dateRange={dateRange} onDateRangeChange={setDateRange} />
          ) : activeTab === "Inventory" ? (
            <ManageInventoryPanel />
          ) : activeTab === "Customers" ? (
            <CustomersPanel />
          ) : activeTab === "Settings" ? (
            <SettingsPanel />
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

// First thing a manager sees: last week's sales and what needs attention.
// Each card opens the tab with the details.
function OverviewPanel({ onOpenTab }: { onOpenTab: (tab: DashboardTab) => void }) {
  const [sales, setSales] = useState<SalesBucket[] | null>(null);
  const [deliveries, setDeliveries] = useState<ManagerDelivery[] | null>(null);
  const [products, setProducts] = useState<InventoryProduct[] | null>(null);
  const [customerCount, setCustomerCount] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    // Each section loads on its own, so one failing request doesn't blank the page.
    void Promise.allSettled([
      fetchSales("week").then((value) => active && setSales(value)),
      fetchDeliveries().then((value) => active && setDeliveries(value)),
      fetchManagedInventory().then(({ products: all }) => active && setProducts(
        all
          .filter((product) => product.active)
          .map((product) => ({ ...product, emoji: emojiFor(product.name, product.category) })),
      )),
      fetchCustomers().then((value) => active && setCustomerCount(value.length)),
    ]).then((results) => {
      if (active && results.some((result) => result.status === "rejected")) {
        setError("Some numbers couldn't be loaded. Refresh to try again.");
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const revenue = sales?.reduce((total, bucket) => total + bucket.revenue, 0);
  const paidOrders = sales?.reduce((total, bucket) => total + bucket.paidOrders, 0);
  const waiting = deliveries?.filter((delivery) => !isFinishedDelivery(delivery.deliveryProgress));
  const outOfStock = products?.filter((product) => product.quantityInStock === 0).length;
  const runningLow = products?.filter((product) => product.quantityInStock > 0 && product.quantityInStock <= LOW_STOCK).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-extrabold text-[#294332]">Overview</h2>
        <p className="mt-1 text-sm text-[#667269]">The last 7 days, and what needs attention.</p>
      </div>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700">{error}</p>}

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <SummaryCard
          label="Revenue"
          value={revenue === undefined ? null : `$${revenue.toFixed(2)}`}
          detail={paidOrders === undefined ? "Last 7 days" : `${paidOrders} paid ${paidOrders === 1 ? "order" : "orders"} · last 7 days`}
          onClick={() => onOpenTab("Sales")}
        />
        <SummaryCard
          label="Awaiting delivery"
          value={waiting ? String(waiting.length) : null}
          detail={waiting?.length === 1 ? "order" : "orders"}
          onClick={() => onOpenTab("Delivery")}
        />
        <SummaryCard
          label="Out of stock"
          value={outOfStock === undefined ? null : String(outOfStock)}
          detail={runningLow === undefined ? "products" : `${runningLow} running low (${LOW_STOCK} or fewer)`}
          tone={outOfStock ? "warning" : "normal"}
          onClick={() => onOpenTab("Inventory")}
        />
        <SummaryCard
          label="Customers"
          value={customerCount === null ? null : String(customerCount)}
          detail="registered accounts"
          onClick={() => onOpenTab("Customers")}
        />
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        {products ? (
          <LowStockTable
            products={products}
            action={<OpenTabButton label="Manage inventory" onClick={() => onOpenTab("Inventory")} />}
          />
        ) : (
          <p role="status" className="rounded-2xl border border-[#e8e7dc] bg-white p-6 text-sm text-[#667269]">Loading stock…</p>
        )}
        <section
          aria-labelledby="waiting-heading"
          className="overflow-hidden rounded-2xl border border-[#e8e7dc] bg-white shadow-[0_3px_12px_rgba(42,65,48,0.04)]"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#ecebe2] px-5 py-5 sm:px-7">
            <div>
              <h3 id="waiting-heading" className="text-xl font-extrabold text-[#294332]">Awaiting delivery</h3>
              <p className="mt-1 text-sm text-[#667269]">Paid orders that haven't been delivered yet.</p>
            </div>
            <OpenTabButton label="View deliveries" onClick={() => onOpenTab("Delivery")} />
          </div>
          {!waiting ? (
            <p role="status" className="px-5 py-6 text-sm text-[#667269] sm:px-7">Loading orders…</p>
          ) : waiting.length === 0 ? (
            <p className="px-5 py-6 text-sm text-[#667269] sm:px-7">Nothing waiting. All orders are delivered.</p>
          ) : (
            <ul className="divide-y divide-[#ecebe2]">
              {waiting.slice(0, 5).map((delivery) => (
                <li key={delivery.orderId} className="flex items-center justify-between gap-4 px-5 py-3.5 sm:px-7">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-[#253b2d]">{delivery.customerName}</span>
                    <span className="font-mono text-xs text-[#899188]">{shortOrderId(delivery.orderId)}</span>
                  </span>
                  <span className="shrink-0 text-sm capitalize text-[#667269]">{delivery.deliveryProgress}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="robot-map-heading">
        <h3 id="robot-map-heading" className="text-xl font-extrabold text-[#294332]">Robot map</h3>
        <div
          role="img"
          aria-label="Blank map canvas for delivery locations"
          className="mt-3 flex min-h-48 items-center justify-center rounded-2xl border border-dashed border-[#dce2d5] bg-white text-sm text-[#899188] shadow-[0_3px_12px_rgba(42,65,48,0.04)]"
        >
          The delivery map will appear here.
        </div>
      </section>
    </div>
  );
}

function isFinishedDelivery(progress: string) {
  return ["delivered", "confirmed", "cancelled", "returned_undelivered"].includes(progress.toLowerCase());
}

// "f5cc53ee-d9e9-…" → "#F5CC53EE": short enough to read out, unique enough to find.
function shortOrderId(orderId: string) {
  return `#${orderId.slice(0, 8).toUpperCase()}`;
}

function SummaryCard({
  label,
  value,
  detail,
  tone = "normal",
  onClick,
}: {
  label: string;
  value: string | null;
  detail: string;
  tone?: "normal" | "warning";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-[#e8e7dc] bg-white p-4 text-left shadow-[0_3px_12px_rgba(42,65,48,0.04)] transition hover:border-[#c9d6bf] hover:shadow-[0_6px_18px_rgba(42,65,48,0.08)] sm:p-5"
    >
      <span className="block text-sm font-bold text-[#667269]">{label}</span>
      <span className={`mt-2 block text-2xl font-extrabold tabular-nums sm:text-3xl ${tone === "warning" ? "text-[#8b5145]" : "text-[#294332]"}`}>
        {value ?? "—"}
      </span>
      <span className="mt-1 block text-xs text-[#7d887b] sm:text-sm">{detail}</span>
    </button>
  );
}

function OpenTabButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-full border border-[#d9e2d2] px-4 py-1.5 text-sm font-bold text-[#416449] hover:bg-[#f1f5eb]"
    >
      {label} →
    </button>
  );
}

function SettingsPanel() {
  const [settings, setSettings] = useState<DeliverySettings>({ deliveryFee: 10, freeDeliveryWeightThreshold: 20 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    fetchDeliverySettings().then((value) => { if (active) setSettings(value); })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "Unable to load settings."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(""); setSuccess("");
    try {
      setSettings(await saveDeliverySettings(settings));
      setSuccess("Delivery settings saved.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save settings."); }
    finally { setSaving(false); }
  };

  return <div>
    <div className="mb-5"><h2 className="text-2xl font-extrabold text-[#294332]">Settings</h2><p className="mt-1 text-sm text-[#667269]">Configure delivery pricing for every customer order.</p></div>
    {loading ? <p role="status" className="rounded-xl border border-[#e8e7dc] bg-white p-5 text-sm text-[#667269]">Loading settings...</p> : (
      <form onSubmit={submit} className="max-w-xl space-y-5 rounded-2xl border border-[#e8e7dc] bg-white p-6 shadow-[0_3px_12px_rgba(42,65,48,0.04)]">
        <label className="block text-sm font-semibold text-[#536459]">Delivery fee ($)
          <input aria-label="Delivery fee" type="number" min="0" step="0.01" required value={settings.deliveryFee} onChange={(e) => setSettings({ ...settings, deliveryFee: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-[#dedfd5] px-4 py-3" />
        </label>
        <label className="block text-sm font-semibold text-[#536459]">Free-delivery threshold (lb)
          <input aria-label="Free-delivery weight threshold" type="number" min="0.01" step="0.01" required value={settings.freeDeliveryWeightThreshold} onChange={(e) => setSettings({ ...settings, freeDeliveryWeightThreshold: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-[#dedfd5] px-4 py-3" />
        </label>
        {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
        {success && <p role="status" className="text-sm text-green-800">{success}</p>}
        <button disabled={saving} className="rounded-xl bg-[#416449] px-5 py-3 font-bold text-white disabled:opacity-60">{saving ? "Saving..." : "Save settings"}</button>
      </form>
    )}
  </div>;
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
          <table className="w-full min-w-[42rem] text-left">
            <thead className="bg-[#f6f7f1] text-xs uppercase tracking-wide text-[#667269]">
              <tr>
                <th scope="col" className="px-5 py-3 font-bold">Name</th>
                <th scope="col" className="px-5 py-3 font-bold">Email</th>
                <th scope="col" className="px-5 py-3 font-bold">Phone</th>
                <th scope="col" className="px-5 py-3 font-bold">Status</th>
                <th scope="col" className="px-5 py-3 font-bold">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ecebe2]">
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <th scope="row" className="px-5 py-4 font-semibold text-[#253b2d]">{customer.firstName} {customer.lastName}</th>
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
                  <td colSpan={5} className="px-5 py-8 text-center text-sm text-[#667269]">
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
          <table className="w-full min-w-[36rem] text-left">
            <thead className="bg-[#f6f7f1] text-xs uppercase tracking-wide text-[#667269]">
              <tr>
                <th scope="col" className="px-5 py-3 font-bold">Order</th>
                <th scope="col" className="px-5 py-3 font-bold">Customer</th>
                <th scope="col" className="px-5 py-3 font-bold">Delivery progress</th>
                <th scope="col" className="px-5 py-3 font-bold">ETA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ecebe2]">
              {deliveries.map((delivery) => (
                <tr key={delivery.orderId}>
                  <th scope="row" className="px-5 py-4 font-mono text-sm text-[#253b2d]" title={delivery.orderId}>
                    {shortOrderId(delivery.orderId)}
                  </th>
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
  dateRange,
  onDateRangeChange,
}: {
  dateRange: DateRange;
  onDateRangeChange: (dateRange: DateRange) => void;
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
          <h2 className="text-2xl font-extrabold text-[#294332]">Sales</h2>
          <p className="mt-1 text-sm text-[#667269]">Paid orders and revenue over time.</p>
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

// The Inventory tab: the overview plus adding, editing, deactivating, and restocking products.
function ManageInventoryPanel() {
  const [products, setProducts] = useState<ManagedProduct[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ManagedProduct | "new" | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const load = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const inventory = await fetchManagedInventory();
      setProducts(inventory.products);
      setCategories(inventory.categories);
    } catch (error) {
      setLoadError((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  // Keeps the same order as the server: active first, then by category and name.
  const handleSaved = (saved: ManagedProduct) => {
    setProducts((current) =>
      [...current.filter((product) => product.id !== saved.id), saved].sort(
        (a, b) =>
          Number(b.active) - Number(a.active) ||
          a.category.localeCompare(b.category) ||
          a.name.localeCompare(b.name),
      ),
    );
  };

  const handleToggleActive = async (product: ManagedProduct) => {
    setActionError(null);
    setBusyIds((current) => new Set(current).add(product.id));
    try {
      handleSaved(await updateProduct(product.id, { active: !product.active }));
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(product.id);
        return next;
      });
    }
  };

  if (isLoading) {
    return <p role="status" className="rounded-2xl bg-white p-6 text-[#5f6b61]">Loading inventory…</p>;
  }
  if (loadError) {
    return (
      <div role="alert" className="rounded-2xl border border-red-200 bg-white p-6">
        <p className="text-red-800">{loadError}</p>
        <button type="button" onClick={() => void load()} className="mt-4 font-bold text-[#416449] underline">Try again</button>
      </div>
    );
  }

  const activeProducts = products
    .filter((product) => product.active)
    .map((product) => ({ ...product, emoji: emojiFor(product.name, product.category) }));
  const query = search.trim().toLowerCase();
  const visibleProducts = products.filter(
    (product) => product.name.toLowerCase().includes(query) || product.category.toLowerCase().includes(query),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-[#294332]">Inventory</h2>
          <p className="mt-1 text-sm text-[#667269]">Add, edit, and restock products.</p>
        </div>
        <Link
          to="/inventory"
          className="rounded-full border-2 border-[#2e4935] px-5 py-2 text-sm font-bold text-[#2e4935] hover:bg-[#2e4935] hover:text-white"
        >
          View in store
        </Link>
      </div>
      <InventorySummary products={activeProducts} />

      <section
        aria-labelledby="manage-products-heading"
        className="overflow-hidden rounded-2xl border border-[#e8e7dc] bg-white shadow-[0_3px_12px_rgba(42,65,48,0.04)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ecebe2] px-5 py-5 sm:px-7">
          <div>
            <h3 id="manage-products-heading" className="text-xl font-extrabold text-[#294332]">All products</h3>
            <p className="mt-1 text-sm text-[#667269]">
              Deactivated products are hidden from shoppers but kept for past orders.
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-3 sm:w-auto">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products"
              aria-label="Search products"
              className="min-w-0 flex-1 rounded-full border border-[#dedfd5] px-4 py-2 text-sm outline-none focus:border-[#416449] sm:w-56 sm:flex-none"
            />
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="rounded-full bg-[#2e4935] px-5 py-2 text-sm font-bold text-white hover:bg-[#253b2d]"
            >
              Add product
            </button>
          </div>
        </div>
        {actionError && (
          <p role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-800 sm:px-7">{actionError}</p>
        )}
        <ProductTable
          products={visibleProducts}
          busyIds={busyIds}
          onEdit={setEditing}
          onToggleActive={(product) => void handleToggleActive(product)}
        />
      </section>

      {editing && (
        <ProductFormDialog
          product={editing === "new" ? undefined : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

// Totals for the products shoppers can currently buy.
function InventorySummary({ products }: { products: InventoryProduct[] }) {
  const categoryCount = new Set(products.map((product) => product.category)).size;
  const totalUnits = products.reduce((total, product) => total + product.quantityInStock, 0);

  return (
    <section aria-label="Catalog overview" className="grid gap-4 sm:grid-cols-3">
      <OverviewCard label="Catalog products" value={products.length} detail="Products currently listed" />
      <OverviewCard label="Categories" value={categoryCount} detail="Across the catalog" />
      <OverviewCard label="Units in stock" value={totalUnits} detail="Combined listed quantities" />
    </section>
  );
}

// The five products closest to running out.
function LowStockTable({ products, action }: { products: InventoryProduct[]; action: ReactNode }) {
  const lowestStockProducts = [...products]
    .sort((first, second) => first.quantityInStock - second.quantityInStock)
    .slice(0, 5);

  return (
    <section
      aria-labelledby="stock-heading"
      className="overflow-hidden rounded-2xl border border-[#e8e7dc] bg-white shadow-[0_3px_12px_rgba(42,65,48,0.04)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#ecebe2] px-5 py-5 sm:px-7">
        <div>
          <h3 id="stock-heading" className="text-xl font-extrabold text-[#294332]">Lowest stock</h3>
          <p className="mt-1 text-sm text-[#667269]">Products shoppers can buy that are closest to running out.</p>
        </div>
        {action}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[22rem] text-left">
          <thead className="bg-[#f6f7f1] text-xs uppercase tracking-wide text-[#667269]">
            <tr>
              <th scope="col" className="px-5 py-3 font-bold sm:px-7">Product</th>
              <th scope="col" className="px-5 py-3 text-right font-bold sm:px-7">In stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ecebe2]">
            {lowestStockProducts.map((product) => (
              <tr key={product.id}>
                <th scope="row" className="px-5 py-3.5 font-semibold text-[#253b2d] sm:px-7">
                  <span aria-hidden="true" className="mr-2">{product.emoji}</span>
                  {product.name}
                </th>
                <td className="px-5 py-3.5 text-right font-bold tabular-nums text-[#253b2d] sm:px-7">
                  {product.quantityInStock === 0 ? <span className="text-[#8b5145]">Out of stock</span> : product.quantityInStock}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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
