import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import {
  fetchCustomerOrders,
  fetchCustomers,
  setCustomerAccountStatus,
  type Customer,
  type CustomerOrderSummary,
} from "../auth/api";
import { SiteHeader } from "../components/SiteHeader";
import { emojiFor } from "../inventory/api";
import type { InventoryProduct } from "../inventory/types";
import { cancelDeliveryRun, createDeliveryRobot, deleteDeliveryRobot, dispatchDeliveries, fetchDeliveries, fetchDeliveryRobots, fetchDeliveryRuns, fetchDeliverySettings, fetchRobotBaseLocation, fetchManagedInventory, fetchManagerAudit, fetchSales, fetchSalesAnalytics, recallDeliveryRobot, refundDeliveryOrder, restoreDeliveryRobot, retireDeliveryRobot, saveDeliverySettings, saveRobotBaseLocation, updateProduct, type DeliveryRobot, type DeliveryRun, type DeliverySettings, type ManagedProduct, type ManagerAuditEntry, type ManagerDelivery, type ProductCategory, type RobotBaseLocation, type SalesAnalytics, type SalesBucket, type SalesRange } from "./api";
import { ProductFormDialog, ProductTable } from "./ProductManager";
import { FailedPaymentsPanel, InventoryReportPanel } from "./ReportsPanel";

import Map, { Layer, Marker, NavigationControl, Source } from "react-map-gl/maplibre";

const tabs = ["Overview", "Customers", "Inventory", "Delivery", "Robot", "Sales", "Stock report", "Failed payments", "Audit", "Settings"] as const;
type DashboardTab = (typeof tabs)[number];

// Sidebar sections. A null heading means the tab stands on its own.
const tabGroups: { heading: string | null; tabs: DashboardTab[] }[] = [
  { heading: null, tabs: ["Overview"] },
  { heading: "Store", tabs: ["Inventory", "Customers"] },
  { heading: "Orders", tabs: ["Delivery", "Robot"] },
  { heading: "Reports", tabs: ["Sales", "Stock report", "Failed payments", "Audit"] },
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
    return <main className="p-8 text-center text-muted" aria-live="polite">Loading your account...</main>;
  }
  if (!user || user.role !== "manager") {
    return <Navigate to={user ? "/" : "/manager-login"} replace />;
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <SiteHeader />
      <main className="flex min-h-[calc(100vh-4.75rem)] flex-col md:flex-row md:items-stretch">
        <aside
          aria-label="Manager dashboard sections"
          className="w-full shrink-0 border-b border-border bg-white p-3 md:sticky md:top-0 md:h-[calc(100vh-4.75rem)] md:w-56 md:overflow-y-auto md:border-b-0 md:border-r md:border-border md:px-4 md:py-5"
        >
          <nav aria-label="Dashboard tabs" className="flex gap-1 overflow-x-auto md:flex-col md:gap-4">
            {tabGroups.map((group) => (
              <div key={group.heading ?? group.tabs[0]} className="flex shrink-0 gap-1 md:flex-col">
                {group.heading && (
                  <p className="hidden px-3 pb-1 text-xs font-bold uppercase tracking-[0.14em] text-muted md:block">
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
                        ? "bg-accent-soft text-ink"
                        : "text-muted hover:bg-canvas hover:text-ink"
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
          ) : activeTab === "Stock report" ? (
            <InventoryReportPanel />
          ) : activeTab === "Failed payments" ? (
            <FailedPaymentsPanel />
          ) : activeTab === "Audit" ? (
            <AuditLogPanel />
          ) : activeTab === "Inventory" ? (
            <ManageInventoryPanel />
          ) : activeTab === "Customers" ? (
            <CustomersPanel />
          ) : activeTab === "Settings" ? (
            <SettingsPanel />
          ) : activeTab === "Delivery" ? (
            <DeliveriesPanel />
          ) : (
            <RobotPanel />
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
        <h2 className="text-2xl font-extrabold text-ink">Overview</h2>
        <p className="mt-1 text-sm text-muted">The last 7 days, and what needs attention.</p>
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
          <p role="status" className="rounded-2xl border border-border bg-white p-6 text-sm text-muted">Loading stock…</p>
        )}
        <section
          aria-labelledby="waiting-heading"
          className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_3px_12px_rgba(0,0,0,0.06)]"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-5 sm:px-7">
            <div>
              <h3 id="waiting-heading" className="text-xl font-extrabold text-ink">Awaiting delivery</h3>
              <p className="mt-1 text-sm text-muted">Paid orders that haven't been delivered yet.</p>
            </div>
            <OpenTabButton label="View deliveries" onClick={() => onOpenTab("Delivery")} />
          </div>
          {!waiting ? (
            <p role="status" className="px-5 py-6 text-sm text-muted sm:px-7">Loading orders…</p>
          ) : waiting.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted sm:px-7">Nothing waiting. All orders are delivered.</p>
          ) : (
            <ul className="divide-y divide-border">
              {waiting.slice(0, 5).map((delivery) => (
                <li key={delivery.orderId} className="flex items-center justify-between gap-4 px-5 py-3.5 sm:px-7">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink">{delivery.customerName}</span>
                    <span className="font-mono text-xs text-muted">{shortOrderId(delivery.orderId)}</span>
                  </span>
                  <span className="shrink-0 text-sm capitalize text-muted">{delivery.deliveryProgress}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="robot-map-heading" className="rounded-2xl border border-border bg-white p-5 shadow-[0_3px_12px_rgba(0,0,0,0.06)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 id="robot-map-heading" className="text-xl font-extrabold text-ink">Robot fleet</h3>
            <p className="mt-1 text-sm text-muted">Open the live fleet view to inspect robot positions, delivery destinations, and stop ETAs.</p>
          </div>
          <OpenTabButton label="Open robot fleet" onClick={() => onOpenTab("Robot")} />
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
      className="rounded-2xl border border-border bg-white p-4 text-left shadow-[0_3px_12px_rgba(0,0,0,0.06)] transition hover:border-accent-ink hover:shadow-[0_6px_18px_rgba(0,0,0,0.08)] sm:p-5"
    >
      <span className="block text-sm font-bold text-muted">{label}</span>
      <span className={`mt-2 block text-2xl font-extrabold tabular-nums sm:text-3xl ${tone === "warning" ? "text-warning" : "text-ink"}`}>
        {value ?? "—"}
      </span>
      <span className="mt-1 block text-xs text-muted sm:text-sm">{detail}</span>
    </button>
  );
}

function SalesMetricCard({ label, value, detail }: { label: string; value: string | null; detail: string }) {
  return (
    <article className="rounded-2xl border border-border bg-white p-4 shadow-[0_3px_12px_rgba(0,0,0,0.06)] sm:p-5">
      <h3 className="text-sm font-bold text-muted">{label}</h3>
      <p className="mt-2 text-2xl font-extrabold tabular-nums text-ink sm:text-3xl">{value ?? "—"}</p>
      <p className="mt-1 text-xs text-muted sm:text-sm">{detail}</p>
    </article>
  );
}

function OpenTabButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-full border border-border px-4 py-1.5 text-sm font-bold text-accent-ink hover:bg-accent-soft"
    >
      {label} →
    </button>
  );
}

function SettingsPanel() {
  const [settings, setSettings] = useState<DeliverySettings>({ deliveryFee: 10, freeDeliveryWeightThreshold: 20 });
  const [base, setBase] = useState<RobotBaseLocation>({ latitude: 37.3382, longitude: -121.8863 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([fetchDeliverySettings(), fetchRobotBaseLocation()]).then(([value, baseValue]) => { if (active) { setSettings(value); setBase(baseValue); } })
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

  const saveBase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(""); setSuccess("");
    try { setBase(await saveRobotBaseLocation(base)); setSuccess("Robot home base saved."); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to save robot base location."); }
    finally { setSaving(false); }
  };

  return <div>
    <div className="mb-5"><h2 className="text-2xl font-extrabold text-ink">Settings</h2><p className="mt-1 text-sm text-muted">Configure delivery pricing for every customer order.</p></div>
    {loading ? <p role="status" className="rounded-xl border border-border bg-white p-5 text-sm text-muted">Loading settings...</p> : (
      <>
      <form onSubmit={submit} className="max-w-xl space-y-5 rounded-2xl border border-border bg-white p-6 shadow-[0_3px_12px_rgba(0,0,0,0.06)]">
        <label className="block text-sm font-semibold text-ink">Delivery fee ($)
          <input aria-label="Delivery fee" type="number" min="0" step="0.01" required value={settings.deliveryFee} onChange={(e) => setSettings({ ...settings, deliveryFee: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-border px-4 py-3 outline-none focus:border-accent-ink" />
        </label>
        <label className="block text-sm font-semibold text-ink">Free-delivery threshold (lb)
          <input aria-label="Free-delivery weight threshold" type="number" min="0.01" step="0.01" required value={settings.freeDeliveryWeightThreshold} onChange={(e) => setSettings({ ...settings, freeDeliveryWeightThreshold: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-border px-4 py-3 outline-none focus:border-accent-ink" />
        </label>
        {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
        {success && <p role="status" className="text-sm text-green-800">{success}</p>}
        <button disabled={saving} className="rounded-xl bg-accent px-5 py-3 font-bold text-on-accent hover:bg-accent-hover disabled:opacity-60">{saving ? "Saving..." : "Save settings"}</button>
      </form>
      <form onSubmit={saveBase} className="mt-5 max-w-xl space-y-5 rounded-2xl border border-border bg-white p-6 shadow-[0_3px_12px_rgba(0,0,0,0.06)]">
        <div><h3 className="text-lg font-extrabold text-ink">Robot home base</h3><p className="mt-1 text-sm text-muted">Coordinates use decimal degrees. This is where robots start and return.</p></div>
        <label className="block text-sm font-semibold text-ink">Latitude<input aria-label="Robot base latitude" type="number" min="-90" max="90" step="0.000001" required value={base.latitude} onChange={(e) => setBase({ ...base, latitude: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-border px-4 py-3 outline-none focus:border-accent-ink" /></label>
        <label className="block text-sm font-semibold text-ink">Longitude<input aria-label="Robot base longitude" type="number" min="-180" max="180" step="0.000001" required value={base.longitude} onChange={(e) => setBase({ ...base, longitude: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-border px-4 py-3 outline-none focus:border-accent-ink" /></label>
        {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
        {success && <p role="status" className="text-sm text-green-800">{success}</p>}
        <button disabled={saving} className="rounded-xl bg-accent px-5 py-3 font-bold text-on-accent hover:bg-accent-hover disabled:opacity-60">{saving ? "Saving..." : "Save home base"}</button>
      </form>
      </>
    )}
  </div>;
}

type CustomerStatusFilter = "all" | Customer["accountStatus"];

function CustomersPanel() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CustomerStatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [orders, setOrders] = useState<CustomerOrderSummary[] | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const selected = customers.find((customer) => customer.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId) {
      setOrders(null);
      setOrdersError("");
      setOrdersLoading(false);
      return;
    }

    let active = true;
    setOrdersLoading(true);
    setOrdersError("");
    fetchCustomerOrders(selectedId)
      .then((result) => {
        if (!active) return;
        setOrders(result.orders);
        // Keep the list row in sync if the detail payload has a fresher status.
        setCustomers((current) =>
          current.map((customer) => (customer.id === result.customer.id ? result.customer : customer)),
        );
      })
      .catch((requestError: unknown) => {
        if (active) {
          setOrders(null);
          setOrdersError(requestError instanceof Error ? requestError.message : "Unable to load orders.");
        }
      })
      .finally(() => {
        if (active) setOrdersLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedId]);

  const query = search.trim().toLowerCase();
  const visibleCustomers = customers.filter((customer) => {
    if (statusFilter !== "all" && customer.accountStatus !== statusFilter) return false;
    if (!query) return true;
    const haystack = `${customer.firstName} ${customer.lastName} ${customer.email} ${customer.phone}`.toLowerCase();
    return haystack.includes(query);
  });

  const handleToggleStatus = async (customer: Customer) => {
    const nextStatus = customer.accountStatus === "active" ? "disabled" : "active";
    setActionError("");
    setBusyId(customer.id);
    try {
      const updated = await setCustomerAccountStatus(customer.id, nextStatus);
      setCustomers((current) => current.map((row) => (row.id === updated.id ? updated : row)));
    } catch (requestError: unknown) {
      setActionError(requestError instanceof Error ? requestError.message : "Unable to update account status.");
    } finally {
      setBusyId(null);
    }
  };

  if (selected) {
    return (
      <CustomerDetailPanel
        customer={selected}
        orders={orders}
        ordersLoading={ordersLoading}
        ordersError={ordersError}
        actionError={actionError}
        busy={busyId === selected.id}
        onBack={() => {
          setSelectedId(null);
          setActionError("");
        }}
        onToggleStatus={() => void handleToggleStatus(selected)}
      />
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-ink">Customers</h2>
          <p className="mt-1 text-sm text-muted">Search accounts, open order history, and suspend or restore access.</p>
        </div>
        <p className="text-sm font-semibold text-muted">
          {visibleCustomers.length} of {customers.length}
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <label className="flex h-11 min-w-[14rem] flex-1 items-center gap-2 rounded-xl border border-border bg-white px-4 text-muted shadow-sm">
          <span className="sr-only">Search customers</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email, or phone"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-ink">
          Status
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as CustomerStatusFilter)}
            className="rounded-lg border border-border bg-white px-3 py-2.5 text-ink shadow-sm"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>
      </div>

      {actionError && (
        <p className="mb-4 rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700" role="alert">
          {actionError}
        </p>
      )}

      {loading ? (
        <p className="rounded-xl border border-border bg-white p-5 text-sm text-muted" role="status">
          Loading customers...
        </p>
      ) : error ? (
        <p className="rounded-xl border border-red-200 bg-white p-5 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-white shadow-[0_3px_12px_rgba(0,0,0,0.06)]">
          <table className="w-full min-w-[48rem] text-left">
            <thead className="bg-canvas text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-5 py-3 font-bold">Name</th>
                <th scope="col" className="px-5 py-3 font-bold">Email</th>
                <th scope="col" className="px-5 py-3 font-bold">Phone</th>
                <th scope="col" className="px-5 py-3 font-bold">Status</th>
                <th scope="col" className="px-5 py-3 font-bold">Joined</th>
                <th scope="col" className="px-5 py-3 font-bold"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleCustomers.map((customer) => (
                <tr key={customer.id}>
                  <th scope="row" className="px-5 py-4 font-semibold text-ink">
                    <button
                      type="button"
                      onClick={() => setSelectedId(customer.id)}
                      className="text-left hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
                    >
                      {customer.firstName} {customer.lastName}
                    </button>
                  </th>
                  <td className="px-5 py-4 text-sm text-muted">{customer.email}</td>
                  <td className="px-5 py-4 text-sm text-muted">{customer.phone}</td>
                  <td className="px-5 py-4">
                    <CustomerStatusBadge status={customer.accountStatus} />
                  </td>
                  <td className="px-5 py-4 text-sm text-muted">
                    {new Date(customer.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedId(customer.id)}
                        className="rounded-full border border-border px-3 py-1.5 text-xs font-bold text-accent-ink hover:bg-accent-soft"
                      >
                        Orders
                      </button>
                      <button
                        type="button"
                        disabled={busyId === customer.id}
                        onClick={() => void handleToggleStatus(customer)}
                        className="rounded-full border border-border px-3 py-1.5 text-xs font-bold text-muted hover:bg-canvas disabled:cursor-wait disabled:opacity-50"
                      >
                        {busyId === customer.id
                          ? "Saving..."
                          : customer.accountStatus === "active"
                            ? "Suspend"
                            : "Restore"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {visibleCustomers.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-muted">
                    {customers.length === 0 ? "No customer accounts found." : "No customers match this search."}
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

function CustomerStatusBadge({ status }: { status: Customer["accountStatus"] }) {
  const active = status === "active";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ${
        active ? "bg-accent-soft text-accent-ink" : "bg-warning-soft text-warning"
      }`}
    >
      {status}
    </span>
  );
}

function CustomerDetailPanel({
  customer,
  orders,
  ordersLoading,
  ordersError,
  actionError,
  busy,
  onBack,
  onToggleStatus,
}: {
  customer: Customer;
  orders: CustomerOrderSummary[] | null;
  ordersLoading: boolean;
  ordersError: string;
  actionError: string;
  busy: boolean;
  onBack: () => void;
  onToggleStatus: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 text-sm font-bold text-accent-ink underline-offset-4 hover:underline"
      >
        ← Back to customers
      </button>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-ink">
            {customer.firstName} {customer.lastName}
          </h2>
          <p className="mt-1 text-sm text-muted">{customer.email} · {customer.phone}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <CustomerStatusBadge status={customer.accountStatus} />
            <span className="text-sm text-muted">
              Joined {new Date(customer.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onToggleStatus}
          className="rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-bold text-accent-ink hover:bg-accent-soft disabled:cursor-wait disabled:opacity-50"
        >
          {busy ? "Saving..." : customer.accountStatus === "active" ? "Suspend account" : "Restore account"}
        </button>
      </div>

      {actionError && (
        <p className="mb-4 rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700" role="alert">
          {actionError}
        </p>
      )}

      <section aria-labelledby="customer-orders-heading">
        <h3 id="customer-orders-heading" className="mb-3 text-lg font-extrabold text-ink">
          Order history
        </h3>
        {ordersLoading ? (
          <p className="rounded-xl border border-border bg-white p-5 text-sm text-muted" role="status">
            Loading orders...
          </p>
        ) : ordersError ? (
          <p className="rounded-xl border border-red-200 bg-white p-5 text-sm text-red-700" role="alert">
            {ordersError}
          </p>
        ) : !orders || orders.length === 0 ? (
          <p className="rounded-xl border border-border bg-white p-5 text-sm text-muted">
            This customer has not placed any orders yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {orders.map((order) => (
              <li
                key={order.orderId}
                className="rounded-2xl border border-border bg-white p-5 shadow-[0_3px_12px_rgba(0,0,0,0.06)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-bold text-ink">
                      #{order.orderId.slice(0, 8).toUpperCase()}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {new Date(order.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-extrabold tabular-nums text-ink">
                      ${order.grandTotal.toFixed(2)}
                    </p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wide text-muted">
                      {order.orderStatus.replaceAll("_", " ")} · {order.paymentStatus}
                    </p>
                  </div>
                </div>
                <ul className="mt-4 space-y-1 border-t border-border pt-3 text-sm text-muted">
                  {order.items.map((item) => (
                    <li key={item.orderItemId} className="flex justify-between gap-4">
                      <span>
                        {item.productName}{" "}
                        <span className="text-muted">× {item.quantity}</span>
                      </span>
                      <span className="shrink-0 tabular-nums">
                        ${(item.priceAtPurchase * item.quantity).toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function canRefundDelivery(progress: string) {
  return progress.toLowerCase() === "awaiting dispatch";
}

function DeliveriesPanel() {
  const [deliveries, setDeliveries] = useState<ManagerDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [dispatching, setDispatching] = useState(false);
  const [refundingOrderId, setRefundingOrderId] = useState<string | null>(null);
  const [dispatchSummary, setDispatchSummary] = useState("");
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

  const runDispatch = async () => {
    setDispatching(true);
    setError("");
    setDispatchSummary("");
    try {
      const result = await dispatchDeliveries();
      setDispatchSummary(
        `${result.runs.length} run${result.runs.length === 1 ? "" : "s"} created. ` +
        `${result.pendingOrderIds.length} order${result.pendingOrderIds.length === 1 ? " remains" : "s remain"} queued; ` +
        `${result.unresolvedAddressOrderIds.length} address${result.unresolvedAddressOrderIds.length === 1 ? " needs" : "es need"} geocoding, ` +
        `${result.overCapacityOrderIds.length} order${result.overCapacityOrderIds.length === 1 ? " exceeds" : "s exceed"} the 200 lb limit.`,
      );
      setDeliveries(await fetchDeliveries());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to dispatch paid orders.");
    } finally {
      setDispatching(false);
    }
  };

  const refundOrder = async (orderId: string) => {
    if (!window.confirm("Refund this order and return its items to stock? This only works before the order is dispatched to a robot.")) {
      return;
    }
    setRefundingOrderId(orderId);
    setError("");
    setDispatchSummary("");
    try {
      await refundDeliveryOrder(orderId);
      setDispatchSummary(`Order ${shortOrderId(orderId)} was refunded and restocked.`);
      setDeliveries(await fetchDeliveries());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to refund this order.");
    } finally {
      setRefundingOrderId(null);
    }
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-ink">Delivery</h2>
          <p className="mt-1 text-sm text-muted">Orders and delivery progress. Refund only before dispatch.</p>
        </div>
        <button
          type="button"
          onClick={() => void runDispatch()}
          disabled={loading || dispatching || refundingOrderId !== null}
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-on-accent transition hover:bg-accent-hover disabled:cursor-wait disabled:opacity-60"
        >
          {dispatching ? "Dispatching…" : "Dispatch paid orders"}
        </button>
      </div>
      {dispatchSummary && <p role="status" className="mb-4 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-ink">{dispatchSummary}</p>}
      {error && <p className="mb-4 rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700" role="alert">{error}</p>}
      {loading ? (
        <p className="rounded-xl border border-border bg-white p-5 text-sm text-muted" role="status">
          Loading deliveries...
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-white shadow-[0_3px_12px_rgba(0,0,0,0.06)]">
          <table className="w-full min-w-[36rem] text-left">
            <thead className="bg-canvas text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-5 py-3 font-bold">Order</th>
                <th scope="col" className="px-5 py-3 font-bold">Customer</th>
                <th scope="col" className="px-5 py-3 font-bold">Delivery progress</th>
                <th scope="col" className="px-5 py-3 font-bold">ETA</th>
                <th scope="col" className="px-5 py-3 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {deliveries.map((delivery) => (
                <tr key={delivery.orderId}>
                  <th scope="row" className="px-5 py-4 font-mono text-sm text-ink" title={delivery.orderId}>
                    {shortOrderId(delivery.orderId)}
                  </th>
                  <td className="px-5 py-4 font-semibold text-ink">{delivery.customerName}</td>
                  <td className="px-5 py-4 text-sm capitalize text-muted">{delivery.deliveryProgress}</td>
                  <td className="px-5 py-4 text-sm text-muted">
                    {delivery.eta ? new Date(delivery.eta).toLocaleString() : "Not scheduled"}
                  </td>
                  <td className="px-5 py-4">
                    {canRefundDelivery(delivery.deliveryProgress) ? (
                      <button
                        type="button"
                        onClick={() => void refundOrder(delivery.orderId)}
                        disabled={dispatching || refundingOrderId !== null}
                        className="rounded-full border border-border px-3 py-1.5 text-sm font-semibold text-accent-ink transition hover:bg-canvas disabled:cursor-wait disabled:opacity-60"
                      >
                        {refundingOrderId === delivery.orderId ? "Refunding…" : "Refund"}
                      </button>
                    ) : (
                      <span className="text-sm text-muted">Cancel run to refund</span>
                    )}
                  </td>
                </tr>
              ))}
              {deliveries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-sm text-muted">
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
  const [analytics, setAnalytics] = useState<SalesAnalytics | null>(null);
  const [customerCount, setCustomerCount] = useState<number | null>(null);
  const [customersError, setCustomersError] = useState("");
  const [salesLoading, setSalesLoading] = useState(true);
  const [salesError, setSalesError] = useState("");

  useEffect(() => {
    let active = true;
    fetchCustomers()
      .then((customers) => {
        if (active) setCustomerCount(customers.length);
      })
      .catch((requestError: unknown) => {
        if (active) setCustomersError(requestError instanceof Error ? requestError.message : "Unable to load customers.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setSalesLoading(true);
    setSalesError("");
    Promise.all([
      fetchSales(salesRangeFor[dateRange]),
      fetchSalesAnalytics(salesRangeFor[dateRange]),
    ])
      .then(([buckets, details]) => {
        if (active) {
          setSales(buckets);
          setAnalytics(details);
        }
      })
      .catch((requestError: unknown) => {
        if (active) setSalesError(requestError instanceof Error ? requestError.message : "Unable to load sales analytics.");
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
          <h2 className="text-2xl font-extrabold text-ink">Sales Report</h2>
          <p className="mt-1 text-sm text-muted">Revenue breakdown and item performance over time.</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-ink">
          Date range
          <select
            value={dateRange}
            onChange={(event) => onDateRangeChange(event.target.value as DateRange)}
            className="rounded-lg border border-border bg-white px-3 py-2 text-ink shadow-sm"
          >
            {dateRanges.map((range) => <option key={range}>{range}</option>)}
          </select>
        </label>
      </div>
      {salesLoading ? (
        <p role="status" className="rounded-xl border border-border bg-white p-5 text-sm text-muted">Loading sales data...</p>
      ) : salesError ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-white p-5 text-sm text-red-700">{salesError}</p>
      ) : analytics && (
        <div className="space-y-4">
          <section aria-label="Sales summary" className="grid gap-3 sm:grid-cols-3 sm:gap-4">
            <SalesMetricCard
              label="Revenue"
              value={`$${sales.reduce((total, bucket) => total + bucket.revenue, 0).toFixed(2)}`}
              detail={dateRange}
            />
            <SalesMetricCard
              label="Orders"
              value={String(sales.reduce((total, bucket) => total + bucket.paidOrders, 0))}
              detail={`Paid orders · ${dateRange.toLowerCase()}`}
            />
            <SalesMetricCard
              label="Customers"
              value={customerCount === null ? null : String(customerCount)}
              detail="Registered accounts"
            />
          </section>
          {customersError && (
            <p role="alert" className="rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700">
              {customersError}
            </p>
          )}
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="min-w-0 xl:col-span-2">
              <SalesBarChart
                title="Sales"
                buckets={sales.map((bucket) => ({ bucketStart: bucket.bucketStart, value: bucket.revenue }))}
                range={salesRangeFor[dateRange]}
                formatValue={(value) => `$${value.toFixed(0)}`}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-4 xl:col-span-1">
              <SalesPieChart className="xl:flex-1" title="Revenue by Top 8 Items" values={topSlices(analytics.items.map((item) => ({ name: item.name, value: item.revenue })), 8)} />
              <SalesPieChart className="xl:flex-1" title="Revenue by Top 3 Categories" values={topSlices(analytics.categories.map((category) => ({ name: category.name, value: category.revenue })), 3)} />
            </div>
          </div>
          <SalesItemsTable items={analytics.items} />
        </div>
      )}
    </>
  );
}

type PieSlice = { name: string; value: number };

function topSlices(values: PieSlice[], limit: number): PieSlice[] {
  const sorted = values.filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
  const shown = sorted.slice(0, limit);
  const remainder = sorted.slice(limit).reduce((total, item) => total + item.value, 0);
  if (remainder > 0) shown.push({ name: limit === 8 ? "Other items" : "Other categories", value: remainder });
  return shown;
}

const chartColors = ["#B6EAF5", "#A7E0D4", "#F9D9A8", "#F8C4B0", "#C7C5F4", "#F5C2D8", "#B3DFF2", "#D4E8A8", "#C5CCD4"];

function SalesPieChart({ title, values, className = "" }: { title: string; values: PieSlice[]; className?: string }) {
  const total = values.reduce((sum, item) => sum + item.value, 0);
  let angle = -90;
  let labelAngle = -90;

  return (
    <section className={`flex min-w-0 flex-col rounded-2xl border border-border bg-white p-4 shadow-[0_3px_12px_rgba(0,0,0,0.06)] sm:p-5 ${className}`} aria-label={title}>
      <h3 className="text-lg font-extrabold text-ink">{title}</h3>
      {total <= 0 ? (
        <p className="py-12 text-center text-sm text-muted">No item sales in this range.</p>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row">
          <svg viewBox="0 0 200 200" role="img" aria-label={`${title}, total $${total.toFixed(2)}`} className="h-44 w-44 shrink-0">
            {values.length === 1 ? (
              <circle cx="100" cy="100" r="98" fill={chartColors[0]} />
            ) : values.map((item, index) => {
              const start = angle;
              const sweep = (item.value / total) * 360;
              angle += sweep;
              const end = angle;
              const startPoint = polarPoint(100, 100, 98, start);
              const endPoint = polarPoint(100, 100, 98, end);
              const largeArc = sweep > 180 ? 1 : 0;
              return (
                <path
                  key={item.name}
                  d={`M 100 100 L ${startPoint.x} ${startPoint.y} A 98 98 0 ${largeArc} 1 ${endPoint.x} ${endPoint.y} Z`}
                  fill={chartColors[index % chartColors.length]}
                  stroke="white"
                  strokeWidth="1.5"
                />
              );
            })}
            {values.length === 1 ? (
              <text x="100" y="104" textAnchor="middle" className="fill-white text-[13px] font-bold">
                100%
              </text>
            ) : values.map((item) => {
              const start = labelAngle;
              const sweep = (item.value / total) * 360;
              labelAngle += sweep;
              const middle = start + sweep / 2;
              const labelPoint = polarPoint(100, 100, 62, middle);
              return (
                <text
                  key={`${item.name}-percentage`}
                  x={labelPoint.x}
                  y={labelPoint.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-white text-[10px] font-bold [paint-order:stroke] stroke-ink [stroke-width:2px]"
                >
                  {((item.value / total) * 100).toFixed(1)}%
                </text>
              );
            })}
          </svg>
          <ul className="grid w-full min-w-0 flex-1 gap-2 text-sm">
            {values.map((item, index) => (
              <li key={item.name} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-ink">
                  <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: chartColors[index % chartColors.length] }} />
                  <span className="truncate">{item.name}</span>
                </span>
                <span className="shrink-0 tabular-nums font-semibold text-ink">
                  ${item.value.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function polarPoint(cx: number, cy: number, radius: number, angle: number) {
  const radians = (angle * Math.PI) / 180;
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}

function SalesBarChart({
  title,
  buckets,
  range,
  formatValue,
}: {
  title: string;
  buckets: { bucketStart: string; value: number }[];
  range: SalesRange;
  formatValue: (value: number) => string;
}) {
  const values = buckets.map((bucket) => bucket.value);
  const maximum = Math.max(...values, 1);
  const minimum = Math.min(...values, 0);
  const span = maximum - minimum || 1;
  const chartTop = 40;
  const chartBottom = 366;
  const baseline = chartTop + (maximum / span) * (chartBottom - chartTop);
  const labelInterval = Math.max(1, Math.ceil(buckets.length / 7));
  const hasValues = values.some((value) => value !== 0);
  const barWidth = Math.min(28, 420 / Math.max(values.length, 1));

  return (
    <section
      aria-label={`${title} chart`}
      className="flex h-full min-w-0 flex-col rounded-2xl border border-border bg-white p-4 shadow-[0_3px_12px_rgba(0,0,0,0.06)] sm:p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold text-ink">{title}</h2>
        <span className="text-sm font-bold tabular-nums text-ink">{formatValue(values.reduce((sum, value) => sum + value, 0))}</span>
      </div>
      <svg
        viewBox="0 0 640 430"
        role="img"
        aria-label={`${title} bar chart for ${range}, showing ${buckets.length} time buckets`}
        className="mt-3 min-h-[18rem] w-full flex-1"
      >
        {[0, 1, 2, 3].map((tick) => {
          const y = chartTop + tick * ((chartBottom - chartTop) / 3);
          const value = maximum - (tick / 3) * span;
          return (
            <g key={tick}>
              <line x1="56" x2="612" y1={y} y2={y} stroke="#e5e7eb" strokeDasharray="4 5" />
              <text x="50" y={y + 4} textAnchor="end" fill="#6b7280" fontSize="11">{formatValue(value)}</text>
            </g>
          );
        })}
        <line x1="56" x2="612" y1={baseline} y2={baseline} stroke="#64748B" />
        {buckets.map((bucket, index) => {
          const centerX = 58 + ((index + 0.5) / Math.max(buckets.length, 1)) * 550;
          const barHeight = Math.abs(bucket.value) * ((chartBottom - chartTop) / span);
          return (
            <g key={bucket.bucketStart}>
              <rect
                x={centerX - barWidth / 2}
                y={bucket.value >= 0 ? baseline - barHeight : baseline}
                width={barWidth}
                height={barHeight}
                rx="3"
                fill="#B6EAF5"
              >
                <title>{`${formatBucketLabel(bucket.bucketStart, range)}: ${formatValue(bucket.value)}`}</title>
              </rect>
              {(index % labelInterval === 0 || index === buckets.length - 1) && (
                <text x={centerX} y="408" textAnchor="middle" fill="#6b7280" fontSize="11">
                  {formatBucketLabel(bucket.bucketStart, range)}
                </text>
              )}
            </g>
          );
        })}
        {!hasValues && (
          <text x="332" y="210" textAnchor="middle" fill="#6b7280" fontSize="13">
            No paid sales in this range
          </text>
        )}
      </svg>
    </section>
  );
}

function SalesItemsTable({ items }: { items: SalesAnalytics["items"] }) {
  const soldItems = items.filter((item) => item.quantity > 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_3px_12px_rgba(0,0,0,0.06)]">
      <div className="border-b border-border px-5 py-4 sm:px-7">
        <h3 className="text-lg font-extrabold text-ink">Item sales and inventory</h3>
        <p className="mt-1 text-sm text-muted">Units sold, revenue, and stock for items sold in this date range.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] text-left">
          <thead className="bg-canvas text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-5 py-3 font-bold">Item</th>
              <th scope="col" className="px-4 py-3 font-bold">Category</th>
              <th scope="col" className="px-4 py-3 text-right font-bold">Quantity sold</th>
              <th scope="col" className="px-4 py-3 text-right font-bold">Revenue</th>
              <th scope="col" className="px-4 py-3 text-right font-bold">Current price</th>
              <th scope="col" className="px-5 py-3 text-right font-bold">On hand</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {soldItems.map((item) => (
              <tr key={item.productId}>
                <th scope="row" className="px-5 py-4 font-semibold text-ink">{item.name}</th>
                <td className="px-4 py-4 text-sm text-muted">{item.category}</td>
                <td className="px-4 py-4 text-right text-sm tabular-nums">{item.quantity}</td>
                <td className="px-4 py-4 text-right text-sm tabular-nums">${item.revenue.toFixed(2)}</td>
                <td className="px-4 py-4 text-right text-sm tabular-nums">${item.currentPrice.toFixed(2)} / {item.unit}</td>
                <td className="px-5 py-4 text-right text-sm tabular-nums">{item.currentStock} {item.unit}</td>
              </tr>
            ))}
            {soldItems.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-muted">No items sold in this date range.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatBucketLabel(bucketStart: string, range: SalesRange) {
  const date = new Date(bucketStart);
  if (range === "today") return date.toLocaleTimeString([], { hour: "numeric" });
  if (range === "all") return date.toLocaleDateString([], { month: "short", year: "2-digit" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function auditSourceLabel(source: ManagerAuditEntry["source"]) {
  if (source === "price") return "Price";
  if (source === "stock") return "Stock";
  return "Change";
}

type AuditTypeFilter = "all" | ManagerAuditEntry["source"];

function startOfLocalDay(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
}

function endOfLocalDay(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
}

function AuditLogPanel() {
  const [entries, setEntries] = useState<ManagerAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<AuditTypeFilter>("all");
  const [actorFilter, setActorFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    let active = true;
    fetchManagerAudit(200)
      .then((results) => {
        if (active) setEntries(results);
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : "Unable to load the audit log.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const actors = useMemo(() => {
    const names = new Set<string>();
    for (const entry of entries) names.add(entry.actorName?.trim() || "System");
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const visibleEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    const fromMs = fromDate ? startOfLocalDay(fromDate) : null;
    const toMs = toDate ? endOfLocalDay(toDate) : null;

    return entries.filter((entry) => {
      if (typeFilter !== "all" && entry.source !== typeFilter) return false;

      const actor = entry.actorName?.trim() || "System";
      if (actorFilter !== "all" && actor !== actorFilter) return false;

      const createdMs = new Date(entry.createdAt).getTime();
      if (fromMs !== null && createdMs < fromMs) return false;
      if (toMs !== null && createdMs > toMs) return false;

      if (!query) return true;
      return (
        entry.summary.toLowerCase().includes(query) ||
        actor.toLowerCase().includes(query) ||
        auditSourceLabel(entry.source).toLowerCase().includes(query) ||
        (entry.tableName ?? "").toLowerCase().includes(query)
      );
    });
  }, [actorFilter, entries, fromDate, search, toDate, typeFilter]);

  const clearFilters = () => {
    setSearch("");
    setTypeFilter("all");
    setActorFilter("all");
    setFromDate("");
    setToDate("");
  };

  const filtersActive = Boolean(search.trim() || typeFilter !== "all" || actorFilter !== "all" || fromDate || toDate);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-ink">Audit log</h2>
          <p className="mt-1 text-sm text-muted">Inventory edits, price changes, and stock movements.</p>
        </div>
        <p className="text-sm font-semibold text-muted">
          {visibleEntries.length} of {entries.length}
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <label className="flex h-11 min-w-[14rem] flex-1 items-center gap-2 rounded-xl border border-border bg-white px-4 text-muted shadow-sm">
          <span className="sr-only">Search audit log</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search summary, person, or type"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-ink">
          Type
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as AuditTypeFilter)}
            className="rounded-lg border border-border bg-white px-3 py-2.5 text-ink shadow-sm"
          >
            <option value="all">All</option>
            <option value="audit">Change</option>
            <option value="price">Price</option>
            <option value="stock">Stock</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-ink">
          Who
          <select
            value={actorFilter}
            onChange={(event) => setActorFilter(event.target.value)}
            className="rounded-lg border border-border bg-white px-3 py-2.5 text-ink shadow-sm"
          >
            <option value="all">Anyone</option>
            {actors.map((actor) => (
              <option key={actor} value={actor}>{actor}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-ink">
          From
          <input
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
            className="rounded-lg border border-border bg-white px-3 py-2.5 text-ink shadow-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-ink">
          To
          <input
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
            className="rounded-lg border border-border bg-white px-3 py-2.5 text-ink shadow-sm"
          />
        </label>
        {filtersActive && (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm font-semibold text-accent-ink shadow-sm transition hover:bg-canvas"
          >
            Clear filters
          </button>
        )}
      </div>

      {error && <p className="mb-4 rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700" role="alert">{error}</p>}
      {loading ? (
        <p className="rounded-xl border border-border bg-white p-5 text-sm text-muted" role="status">
          Loading audit history...
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-white shadow-[0_3px_12px_rgba(0,0,0,0.06)]">
          <table className="w-full min-w-[40rem] text-left">
            <thead className="bg-canvas text-xs uppercase tracking-wide text-muted">
              <tr>
                <th scope="col" className="px-5 py-3 font-bold">When</th>
                <th scope="col" className="px-5 py-3 font-bold">Type</th>
                <th scope="col" className="px-5 py-3 font-bold">Who</th>
                <th scope="col" className="px-5 py-3 font-bold">What changed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleEntries.map((entry) => (
                <tr key={`${entry.source}-${entry.id}`}>
                  <td className="whitespace-nowrap px-5 py-4 text-sm text-muted">
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-accent-ink">{auditSourceLabel(entry.source)}</td>
                  <td className="px-5 py-4 text-sm text-ink">{entry.actorName ?? "System"}</td>
                  <td className="px-5 py-4 text-sm text-ink">{entry.summary}</td>
                </tr>
              ))}
              {visibleEntries.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-sm text-muted">
                    {entries.length === 0
                      ? "No inventory or price changes recorded yet."
                      : "No audit entries match these filters."}
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
    return <p role="status" className="rounded-2xl bg-white p-6 text-muted">Loading inventory…</p>;
  }
  if (loadError) {
    return (
      <div role="alert" className="rounded-2xl border border-red-200 bg-white p-6">
        <p className="text-red-800">{loadError}</p>
        <button type="button" onClick={() => void load()} className="mt-4 font-bold text-accent-ink underline">Try again</button>
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
          <h2 className="text-2xl font-extrabold text-ink">Inventory</h2>
          <p className="mt-1 text-sm text-muted">Add, edit, and restock products.</p>
        </div>
        <Link
          to="/inventory"
          className="rounded-full border-2 border-accent-ink px-5 py-2 text-sm font-bold text-accent-ink transition hover:bg-accent hover:text-on-accent"
        >
          View in store
        </Link>
      </div>
      <InventorySummary products={activeProducts} />

      <section
        aria-labelledby="manage-products-heading"
        className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_3px_12px_rgba(0,0,0,0.06)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-5 sm:px-7">
          <div>
            <h3 id="manage-products-heading" className="text-xl font-extrabold text-ink">All products</h3>
            <p className="mt-1 text-sm text-muted">
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
              className="min-w-0 flex-1 rounded-full border border-border px-4 py-2 text-sm outline-none focus:border-accent-ink sm:w-56 sm:flex-none"
            />
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-on-accent hover:bg-accent-hover"
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
          onSaved={handleSaved}
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
      className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_3px_12px_rgba(0,0,0,0.06)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-5 sm:px-7">
        <div>
          <h3 id="stock-heading" className="text-xl font-extrabold text-ink">Lowest stock</h3>
          <p className="mt-1 text-sm text-muted">Products shoppers can buy that are closest to running out.</p>
        </div>
        {action}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[22rem] text-left">
          <thead className="bg-canvas text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-5 py-3 font-bold sm:px-7">Product</th>
              <th scope="col" className="px-5 py-3 text-right font-bold sm:px-7">In stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lowestStockProducts.map((product) => (
              <tr key={product.id}>
                <th scope="row" className="px-5 py-3.5 font-semibold text-ink sm:px-7">
                  <span aria-hidden="true" className="mr-2">{product.emoji}</span>
                  {product.name}
                </th>
                <td className="px-5 py-3.5 text-right font-bold tabular-nums text-ink sm:px-7">
                  {product.quantityInStock === 0 ? <span className="text-warning">Out of stock</span> : product.quantityInStock}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RobotPanel() {
  const [robots, setRobots] = useState<DeliveryRobot[]>([]);
  const [runs, setRuns] = useState<DeliveryRun[]>([]);
  const [runFilter, setRunFilter] = useState<"all" | "delivery" | "recall">("all");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newRobotDraft, setNewRobotDraft] = useState<{ robotId: string; robotName: string } | null>(null);
  const [fleetFilter, setFleetFilter] = useState<"active" | "disabled" | "all">("active");
  const [robotSearch, setRobotSearch] = useState("");
  const [selectedRobotId, setSelectedRobotId] = useState<string | null>(null);
  const [deletePendingRobotId, setDeletePendingRobotId] = useState<string | null>(null);

  const refresh = useCallback(async (initial = false) => {
    try {
      const [nextRobots, nextRuns] = await Promise.all([fetchDeliveryRobots(), fetchDeliveryRuns()]);
      setRobots(nextRobots);
      setRuns(nextRuns);
      if (!newRobotDraft) setError("");
      setSelectedRunId((selected) => selected && nextRuns.some((run) => run.runId === selected)
        ? selected
        : nextRuns.find((run) => run.status === "active" || run.status === "assigned")?.runId ?? nextRuns[0]?.runId ?? null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load the robot fleet.");
    } finally {
      if (initial) setLoading(false);
    }
  }, [newRobotDraft]);

  useEffect(() => {
    void refresh(true);
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const filteredRuns = useMemo(
    () => runFilter === "all" ? runs : runs.filter((run) => run.runType === runFilter),
    [runFilter, runs],
  );
  const robotCounts = useMemo(() => ({
    active: robots.filter((robot) => robot.status !== "disabled").length,
    disabled: robots.filter((robot) => robot.status === "disabled").length,
  }), [robots]);
  const visibleRobots = useMemo(() => {
    const search = robotSearch.trim().toLowerCase();
    return robots.filter((robot) => {
      const matchesFilter = fleetFilter === "all" || (fleetFilter === "disabled" ? robot.status === "disabled" : robot.status !== "disabled");
      const matchesSearch = !search || robot.robotName.toLowerCase().includes(search) || robot.robotId.toLowerCase().includes(search);
      return matchesFilter && matchesSearch;
    });
  }, [fleetFilter, robotSearch, robots]);
  const selectedRun = filteredRuns.find((run) => run.runId === selectedRunId) ?? null;
  const selectedRobot = robots.find((robot) => robot.robotId === selectedRun?.robotId) ?? null;
  const selectedFleetRobot = robots.find((robot) => robot.robotId === selectedRobotId) ?? null;
  const selectedFleetRun = selectedFleetRobot
    ? runs.find((run) => run.robotId === selectedFleetRobot.robotId && ["assigned", "active", "returning"].includes(run.status)) ?? null
    : null;
  const route = useMemo(() => selectedRun?.routeGeometry && selectedRun.routeGeometry.length > 0
    ? {
        type: "Feature" as const,
        properties: {},
        geometry: { type: "LineString" as const, coordinates: selectedRun.routeGeometry },
      }
    : null, [selectedRun?.routeGeometry]);

  const mapPoints = [
    ...(selectedRun?.routeGeometry ?? []),
    ...((selectedRun?.stops ?? []).flatMap((stop) => stop.latitude != null && stop.longitude != null
      ? [[stop.longitude, stop.latitude] as [number, number]]
      : [])),
    ...(selectedRobot?.currentLatitude != null && selectedRobot.currentLongitude != null
      ? [[selectedRobot.currentLongitude, selectedRobot.currentLatitude] as [number, number]]
      : []),
  ].filter(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude));
  const mapBounds = mapPoints.length > 0
    ? [
        [Math.min(...mapPoints.map(([longitude]) => longitude)), Math.min(...mapPoints.map(([, latitude]) => latitude))],
        [Math.max(...mapPoints.map(([longitude]) => longitude)), Math.max(...mapPoints.map(([, latitude]) => latitude))],
      ] as [[number, number], [number, number]]
    : null;

  const stopRun = async () => {
    if (!selectedRun || !["assigned", "active"].includes(selectedRun.status)) return;
    const proceed = window.confirm("Stop this delivery run? Delivered orders stay delivered; remaining orders return to the paid queue for a later dispatch.");
    if (!proceed) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await cancelDeliveryRun(selectedRun.runId);
      setNotice(`Stopped run ${shortOrderId(selectedRun.runId)}. Undelivered orders are back in the paid queue.`);
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to stop the delivery run.");
    } finally {
      setBusy(false);
    }
  };

  const recallRobot = async (robot: DeliveryRobot) => {
    const activeRun = runs.find((run) => run.robotId === robot.robotId && ["assigned", "active"].includes(run.status));
    const returningRun = runs.find((run) => run.robotId === robot.robotId && run.status === "returning");
    if (returningRun) return;
    if (activeRun) {
      const proceed = window.confirm(
        `${robot.robotName} is delivering an order. Recall it now? The active delivery will be cancelled and its undelivered orders will return to the paid queue for later dispatch.`,
      );
      if (!proceed) return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await recallDeliveryRobot(robot.robotId);
      setNotice(activeRun
        ? `${robot.robotName} is returning to the store. The active delivery was cancelled and returned to the paid queue.`
        : `${robot.robotName} is returning to the store.`);
      await refresh();
      if (result.returnRunId) setSelectedRunId(result.returnRunId);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to recall the robot.");
    } finally {
      setBusy(false);
    }
  };

  const openAddRobotDialog = () => {
    const nextNumber = robots.reduce((highest, robot) => {
      const match = /^Demo Robot (\d+)$/.exec(robot.robotName);
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0) + 1;
    setError("");
    setNotice("");
    setNewRobotDraft({ robotId: crypto.randomUUID(), robotName: `Demo Robot ${nextNumber}` });
  };

  const addRobot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newRobotDraft || !newRobotDraft.robotName.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const robot = await createDeliveryRobot({ ...newRobotDraft, robotName: newRobotDraft.robotName.trim() });
      setNewRobotDraft(null);
      setNotice(`${robot.robotName} was added to the fleet and is ready for dispatch.`);
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to add the robot.");
    } finally {
      setBusy(false);
    }
  };

  const changeRobotStatus = async (robot: DeliveryRobot) => {
    const isDisabled = robot.status === "disabled";
    if (!isDisabled) {
      const activeRun = runs.find((run) => run.robotId === robot.robotId && ["assigned", "active", "returning"].includes(run.status));
      if (activeRun) {
        setError("Stop or recall this robot before retiring it.");
        return;
      }
      if (!window.confirm(`Retire ${robot.robotName}? It will stay in the system but will no longer receive deliveries.`)) return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (isDisabled) {
        await restoreDeliveryRobot(robot.robotId);
        setNotice(`${robot.robotName} was restored and is available for dispatch.`);
      } else {
        await retireDeliveryRobot(robot.robotId);
        setNotice(`${robot.robotName} was retired and disabled.`);
      }
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : `Unable to ${isDisabled ? "restore" : "retire"} the robot.`);
    } finally {
      setBusy(false);
    }
  };

  const deleteRobot = async (robot: DeliveryRobot) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await deleteDeliveryRobot(robot.robotId);
      setDeletePendingRobotId(null);
      setSelectedRobotId(null);
      setNotice(`${robot.robotName} was deleted from the fleet.`);
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to delete the robot.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-extrabold text-ink">Robot fleet</h2>
            <p className="mt-1 text-sm text-muted">Live robot locations, planned routes, destinations, and stop ETAs.</p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={openAddRobotDialog}
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-on-accent transition hover:bg-accent-hover disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? "Updating fleet…" : "Add robot"}
          </button>
        </div>
      </div>
      {newRobotDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" role="dialog" aria-modal="true" aria-labelledby="add-robot-title">
          <form onSubmit={(event) => void addRobot(event)} className="w-full max-w-lg rounded-2xl border border-border bg-white p-6 shadow-xl">
            <h3 id="add-robot-title" className="text-xl font-extrabold text-ink">Add robot</h3>
            <p className="mt-1 text-sm text-muted">Review the generated ID and name before registering this robot.</p>
            <label className="mt-5 block text-sm font-bold text-ink" htmlFor="new-robot-id">Robot ID</label>
            <input id="new-robot-id" value={newRobotDraft.robotId} disabled className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2.5 font-mono text-sm text-muted" />
            <label className="mt-4 block text-sm font-bold text-ink" htmlFor="new-robot-name">Robot name</label>
            <input
              id="new-robot-name"
              value={newRobotDraft.robotName}
              onChange={(event) => setNewRobotDraft((draft) => draft ? { ...draft, robotName: event.target.value } : draft)}
              maxLength={100}
              autoFocus
              required
              className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-ink focus:border-accent-ink focus:outline-none focus:ring-2 focus:ring-accent-ink/20"
            />
            {error && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" disabled={busy} onClick={() => setNewRobotDraft(null)} className="rounded-full border border-border px-4 py-2.5 text-sm font-bold text-accent-ink hover:bg-accent-soft disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={busy || !newRobotDraft.robotName.trim()} className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-on-accent transition hover:bg-accent-hover disabled:cursor-wait disabled:opacity-60">{busy ? "Creating…" : "Confirm creation"}</button>
            </div>
          </form>
        </div>
      )}
      {notice && <p role="status" className="mb-4 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-ink">{notice}</p>}
      {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700">{error}</p>}
      {loading ? (
        <p role="status" className="rounded-xl border border-border bg-white p-5 text-sm text-muted">Loading robot fleet…</p>
      ) : (
        <>
          <section aria-label="Robots" className="mb-5 overflow-hidden rounded-2xl border border-border bg-white">
            <div className="border-b border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-extrabold text-ink">Fleet</h3>
                  <p className="mt-1 text-xs text-muted">{visibleRobots.length} of {robots.length} robots shown · select a robot for details</p>
                </div>
                <input
                  aria-label="Search robots"
                  value={robotSearch}
                  onChange={(event) => setRobotSearch(event.target.value)}
                  placeholder="Search name or ID"
                  className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-ink focus:border-accent-ink focus:outline-none focus:ring-2 focus:ring-accent-ink/20 sm:w-56"
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Robot status filter">
                {(["active", "disabled", "all"] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    role="tab"
                    aria-selected={fleetFilter === filter}
                    onClick={() => setFleetFilter(filter)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize ${fleetFilter === filter ? "bg-accent text-on-accent" : "bg-canvas text-muted hover:bg-accent-soft hover:text-accent-ink"}`}
                  >
                    {filter === "active" ? `Active (${robotCounts.active})` : filter === "disabled" ? `Disabled (${robotCounts.disabled})` : `All (${robots.length})`}
                  </button>
                ))}
              </div>
            </div>
            <div className="divide-y divide-border">
              {visibleRobots.map((robot) => (
                <article
                  key={robot.robotId}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedRobotId(robot.robotId)}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedRobotId(robot.robotId); }}
                  className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-canvas focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-ink sm:flex-nowrap"
                >
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${robot.status === "disabled" ? "bg-muted" : robot.status === "available" ? "bg-accent" : "bg-warning"}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-extrabold text-ink">{robot.robotName}</h4>
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold capitalize text-accent-ink">{robot.status.replaceAll("_", " ")}</span>
                    </div>
                    <p className="mt-1 truncate font-mono text-xs text-muted">{robot.robotId}</p>
                  </div>
                  <div className="hidden text-right text-xs text-muted sm:block">
                    <p>{robot.currentLatitude != null && robot.currentLongitude != null ? `${robot.currentLatitude.toFixed(5)}, ${robot.currentLongitude.toFixed(5)}` : "Position unavailable"}</p>
                    <p className="mt-1">Updated {new Date(robot.lastUpdated).toLocaleTimeString()}</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy || robot.status === "disabled" || runs.some((run) => run.robotId === robot.robotId && run.status === "returning")}
                    onClick={(event) => { event.stopPropagation(); void recallRobot(robot); }}
                    className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-bold text-accent-ink hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {robot.status === "disabled" ? "Retired" : runs.some((run) => run.robotId === robot.robotId && run.status === "returning") ? "Returning…" : "Recall"}
                  </button>
                </article>
              ))}
              {visibleRobots.length === 0 && <p className="px-4 py-6 text-sm text-muted">No robots match this filter.</p>}
            </div>
          </section>

          {selectedFleetRobot && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" role="dialog" aria-modal="true" aria-labelledby="robot-detail-title">
              <section className="w-full max-w-lg rounded-2xl border border-border bg-white p-6 shadow-xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 id="robot-detail-title" className="text-xl font-extrabold text-ink">{selectedFleetRobot.robotName}</h3>
                    <p className="mt-1 break-all font-mono text-xs text-muted">{selectedFleetRobot.robotId}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedRobotId(null)} className="rounded-full border border-border px-3 py-1 text-sm font-bold text-muted hover:bg-canvas">Close</button>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-canvas p-3"><p className="text-xs text-muted">Status</p><p className="mt-1 font-bold capitalize text-ink">{selectedFleetRobot.status.replaceAll("_", " ")}</p></div>
                  <div className="rounded-xl bg-canvas p-3"><p className="text-xs text-muted">Capacity</p><p className="mt-1 font-bold text-ink">{selectedFleetRobot.maximumOrders} orders · {selectedFleetRobot.maximumWeight} lbs</p></div>
                  <div className="col-span-2 rounded-xl bg-canvas p-3"><p className="text-xs text-muted">Current location</p><p className="mt-1 font-mono text-sm text-ink">{selectedFleetRobot.currentLatitude != null && selectedFleetRobot.currentLongitude != null ? `${selectedFleetRobot.currentLatitude.toFixed(5)}, ${selectedFleetRobot.currentLongitude.toFixed(5)}` : "Position unavailable"}</p><p className="mt-1 text-xs text-muted">Updated {new Date(selectedFleetRobot.lastUpdated).toLocaleTimeString()}</p></div>
                </div>
                {selectedFleetRun && <p className="mt-4 rounded-xl bg-accent-soft px-4 py-3 text-sm font-semibold text-accent-ink">Current {selectedFleetRun.runType === "recall" ? "return" : "delivery"} run: {selectedFleetRun.stops.length} stops · {selectedFleetRun.status}</p>}
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  {selectedFleetRobot.status !== "disabled" && <button type="button" disabled={busy || Boolean(selectedFleetRun)} onClick={() => void recallRobot(selectedFleetRobot)} className="rounded-full border border-border px-4 py-2 text-sm font-bold text-accent-ink hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50">Recall to store</button>}
                  <button type="button" disabled={busy || Boolean(selectedFleetRun)} onClick={() => void changeRobotStatus(selectedFleetRobot)} className="rounded-full border border-border px-4 py-2 text-sm font-bold text-muted hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50">{selectedFleetRobot.status === "disabled" ? "Restore robot" : "Retire robot"}</button>
                  <button type="button" disabled={busy || Boolean(selectedFleetRun)} onClick={() => setDeletePendingRobotId(selectedFleetRobot.robotId)} className="rounded-full border border-red-200 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50">Delete robot</button>
                </div>
              </section>
            </div>
          )}

          {deletePendingRobotId && selectedFleetRobot && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 px-4" role="dialog" aria-modal="true" aria-labelledby="delete-robot-title">
              <section className="w-full max-w-md rounded-2xl border border-border bg-white p-6 shadow-xl">
                <h3 id="delete-robot-title" className="text-xl font-extrabold text-ink">Delete robot?</h3>
                <p className="mt-2 text-sm text-muted">This permanently removes <strong>{selectedFleetRobot.robotName}</strong> and its ID from the fleet. Robots with delivery history cannot be deleted and should be retired instead.</p>
                <p className="mt-3 break-all rounded-xl bg-canvas px-3 py-2 font-mono text-xs text-muted">{selectedFleetRobot.robotId}</p>
                {error && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
                <div className="mt-6 flex justify-end gap-3">
                  <button type="button" disabled={busy} onClick={() => setDeletePendingRobotId(null)} className="rounded-full border border-border px-4 py-2.5 text-sm font-bold text-accent-ink hover:bg-accent-soft disabled:opacity-50">Cancel</button>
                  <button type="button" disabled={busy} onClick={() => void deleteRobot(selectedFleetRobot)} className="rounded-full bg-red-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-800 disabled:cursor-wait disabled:opacity-60">{busy ? "Deleting…" : "Confirm delete"}</button>
                </div>
              </section>
            </div>
          )}

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(15rem,0.8fr)_minmax(0,2fr)]">
            <section aria-label="Delivery runs" className="overflow-hidden rounded-2xl border border-border bg-white">
              <div className="border-b border-border px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-extrabold text-ink">Runs</h3>
                  <label className="sr-only" htmlFor="robot-run-filter">Filter robot runs</label>
                  <select
                    id="robot-run-filter"
                    value={runFilter}
                    onChange={(event) => setRunFilter(event.target.value as typeof runFilter)}
                    className="rounded-lg border border-border bg-white px-2 py-1 text-xs font-bold text-accent-ink"
                  >
                    <option value="all">All runs</option>
                    <option value="delivery">Delivery runs</option>
                    <option value="recall">Recall runs</option>
                  </select>
                </div>
                <p className="mt-1 text-xs text-muted">Refreshes every few seconds · {filteredRuns.length} shown</p>
              </div>
              <ul className="max-h-[32rem] divide-y divide-border overflow-y-auto">
                {filteredRuns.map((run) => (
                  <li key={run.runId}>
                    <button type="button" aria-pressed={selectedRunId === run.runId} onClick={() => setSelectedRunId(run.runId)} className={`w-full px-4 py-3 text-left ${selectedRunId === run.runId ? "bg-accent-soft" : "hover:bg-canvas"}`}>
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-ink">{shortOrderId(run.runId)}</span>
                        <span className="text-xs capitalize text-muted">{run.status}</span>
                      </span>
                      <span className="mt-1 block text-xs text-muted">{run.runType === "recall" ? "Recall" : "Delivery"} · {run.robotName} · {run.stops.length} stops</span>
                    </button>
                  </li>
                ))}
                {filteredRuns.length === 0 && <li className="px-4 py-5 text-sm text-muted">No {runFilter === "all" ? "robot" : runFilter} runs found.</li>}
              </ul>
            </section>

            <div>
              <section aria-label="Selected route map" className="h-[55vh] min-h-[350px] overflow-hidden rounded-2xl border border-border bg-white">
                <Map
                  key={selectedRun?.runId ?? "fleet-map"}
                  initialViewState={mapBounds
                    ? { bounds: mapBounds, fitBoundsOptions: { padding: 48, maxZoom: 14 } }
                    : { longitude: -121.8863, latitude: 37.3382, zoom: 10 }}
                  mapStyle="https://tiles.openfreemap.org/styles/liberty"
                  style={{ width: "100%", height: "100%" }}
                >
                  <NavigationControl position="top-right" />
                  {route && <Source id="manager-delivery-route" type="geojson" data={route}>
                    <Layer id="manager-delivery-route-line" type="line" paint={{ "line-color": "#B6EAF5", "line-width": 5, "line-opacity": 0.8 }} />
                  </Source>}
                  {selectedRun?.stops.map((stop) => stop.latitude != null && stop.longitude != null && (
                    <Marker key={`${stop.orderId}-${stop.stopNumber}`} latitude={stop.latitude} longitude={stop.longitude} anchor="center">
                      <span title={`Stop ${stop.stopNumber}: order ${shortOrderId(stop.orderId)}`} className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#F8C4B0] text-xs font-extrabold text-ink shadow">{stop.stopNumber}</span>
                    </Marker>
                  ))}
                  {selectedRobot?.currentLatitude != null && selectedRobot.currentLongitude != null && (
                    <Marker latitude={selectedRobot.currentLatitude} longitude={selectedRobot.currentLongitude} anchor="center">
                      <span title={`${selectedRobot.robotName} current position`} className="flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-white bg-accent text-lg shadow-lg">🤖</span>
                    </Marker>
                  )}
                </Map>
              </section>

              {selectedRun ? (
                <section aria-label="Run details" className="mt-4 overflow-hidden rounded-2xl border border-border bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4">
                    <div>
                      <h3 className="font-extrabold text-ink">{selectedRun.robotName} · run {shortOrderId(selectedRun.runId)}</h3>
                      <p className="mt-1 text-xs capitalize text-muted">
                        {selectedRun.status} · {selectedRun.routeSource === "approximate" ? "approximate route" : selectedRun.routeSource ?? "route unavailable"}
                        {selectedRun.routeDistanceMeters != null && ` · ${(selectedRun.routeDistanceMeters / 1000).toFixed(1)} km`}
                      </p>
                    </div>
                    {["assigned", "active"].includes(selectedRun.status) && (
                      <button type="button" disabled={busy} onClick={() => void stopRun()} className="rounded-full border border-red-200 px-4 py-2 text-sm font-bold text-red-800 hover:bg-red-50 disabled:opacity-50">
                        {busy ? "Stopping…" : "Stop run"}
                      </button>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[34rem] text-left text-sm">
                      <thead className="bg-canvas text-xs uppercase tracking-wide text-muted">
                        <tr><th className="px-4 py-3">Stop</th><th className="px-4 py-3">Order / destination</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">ETA</th></tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {selectedRun.stops.map((stop) => (
                          <tr key={`${stop.orderId}-${stop.stopNumber}`}>
                            <td className="px-4 py-3">{stop.stopNumber}</td>
                            <td className="px-4 py-3">
                              <span className="block font-mono text-xs font-bold">{shortOrderId(stop.orderId)}</span>
                              <span className="block text-xs text-ink">{stop.street}, {stop.city}, {stop.state} {stop.zipCode}</span>
                              <span className="text-xs text-muted">{stop.latitude != null && stop.longitude != null ? `${stop.latitude.toFixed(5)}, ${stop.longitude.toFixed(5)}` : "Address coordinates unavailable"}</span>
                            </td>
                            <td className="px-4 py-3 capitalize text-muted">{stop.status.replaceAll("_", " ")}</td>
                            <td className="px-4 py-3 text-muted">{stop.eta ? new Date(stop.eta).toLocaleString() : "Not scheduled"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : (
                <p className="mt-4 rounded-2xl border border-border bg-white p-5 text-sm text-muted">Select a run to see its route and delivery destinations.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function OverviewCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <article className="rounded-2xl border border-border bg-white p-5 shadow-[0_3px_12px_rgba(0,0,0,0.06)]">
      <p className="text-sm font-bold text-muted">{label}</p>
      <p className="mt-2 text-3xl font-extrabold tabular-nums text-ink">{value}</p>
      <p className="mt-1 text-sm text-muted">{detail}</p>
    </article>
  );
}
