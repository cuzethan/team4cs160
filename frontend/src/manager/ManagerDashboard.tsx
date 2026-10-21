import { useEffect, useState, type FormEvent, type ReactNode } from "react";
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
import { fetchDeliveries, fetchDeliverySettings, fetchManagedInventory, fetchSales, fetchSalesAnalytics, saveDeliverySettings, updateProduct, type DeliverySettings, type ManagedProduct, type ManagerDelivery, type ProductCategory, type SalesAnalytics, type SalesBucket, type SalesRange } from "./api";
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
          <h2 className="text-2xl font-extrabold text-[#294332]">Customers</h2>
          <p className="mt-1 text-sm text-[#667269]">Search accounts, open order history, and suspend or restore access.</p>
        </div>
        <p className="text-sm font-semibold text-[#667269]">
          {visibleCustomers.length} of {customers.length}
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <label className="flex h-11 min-w-[14rem] flex-1 items-center gap-2 rounded-xl border border-[#e6e6dc] bg-white px-4 text-[#899188] shadow-sm">
          <span className="sr-only">Search customers</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email, or phone"
            className="w-full bg-transparent text-sm text-[#304336] outline-none placeholder:text-[#a3aaa1]"
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-[#426149]">
          Status
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as CustomerStatusFilter)}
            className="rounded-lg border border-[#dce2d5] bg-white px-3 py-2.5 text-[#253b2d] shadow-sm"
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
                <th scope="col" className="px-5 py-3 font-bold">Name</th>
                <th scope="col" className="px-5 py-3 font-bold">Email</th>
                <th scope="col" className="px-5 py-3 font-bold">Phone</th>
                <th scope="col" className="px-5 py-3 font-bold">Status</th>
                <th scope="col" className="px-5 py-3 font-bold">Joined</th>
                <th scope="col" className="px-5 py-3 font-bold"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ecebe2]">
              {visibleCustomers.map((customer) => (
                <tr key={customer.id}>
                  <th scope="row" className="px-5 py-4 font-semibold text-[#253b2d]">
                    <button
                      type="button"
                      onClick={() => setSelectedId(customer.id)}
                      className="text-left hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#416449]"
                    >
                      {customer.firstName} {customer.lastName}
                    </button>
                  </th>
                  <td className="px-5 py-4 text-sm text-[#667269]">{customer.email}</td>
                  <td className="px-5 py-4 text-sm text-[#667269]">{customer.phone}</td>
                  <td className="px-5 py-4">
                    <CustomerStatusBadge status={customer.accountStatus} />
                  </td>
                  <td className="px-5 py-4 text-sm text-[#667269]">
                    {new Date(customer.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedId(customer.id)}
                        className="rounded-full border border-[#d9e2d2] px-3 py-1.5 text-xs font-bold text-[#416449] hover:bg-[#f1f5eb]"
                      >
                        Orders
                      </button>
                      <button
                        type="button"
                        disabled={busyId === customer.id}
                        onClick={() => void handleToggleStatus(customer)}
                        className="rounded-full border border-[#d9e2d2] px-3 py-1.5 text-xs font-bold text-[#667269] hover:bg-[#f6f7f1] disabled:cursor-wait disabled:opacity-50"
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
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-[#667269]">
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
        active ? "bg-[#e9f1df] text-[#416449]" : "bg-[#f3e6e3] text-[#8b5145]"
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
        className="mb-4 text-sm font-bold text-[#416449] underline-offset-4 hover:underline"
      >
        ← Back to customers
      </button>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-[#294332]">
            {customer.firstName} {customer.lastName}
          </h2>
          <p className="mt-1 text-sm text-[#667269]">{customer.email} · {customer.phone}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <CustomerStatusBadge status={customer.accountStatus} />
            <span className="text-sm text-[#7d887b]">
              Joined {new Date(customer.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onToggleStatus}
          className="rounded-xl border border-[#d9e2d2] bg-white px-4 py-2.5 text-sm font-bold text-[#416449] hover:bg-[#f1f5eb] disabled:cursor-wait disabled:opacity-50"
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
        <h3 id="customer-orders-heading" className="mb-3 text-lg font-extrabold text-[#294332]">
          Order history
        </h3>
        {ordersLoading ? (
          <p className="rounded-xl border border-[#e8e7dc] bg-white p-5 text-sm text-[#667269]" role="status">
            Loading orders...
          </p>
        ) : ordersError ? (
          <p className="rounded-xl border border-red-200 bg-white p-5 text-sm text-red-700" role="alert">
            {ordersError}
          </p>
        ) : !orders || orders.length === 0 ? (
          <p className="rounded-xl border border-[#e8e7dc] bg-white p-5 text-sm text-[#667269]">
            This customer has not placed any orders yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {orders.map((order) => (
              <li
                key={order.orderId}
                className="rounded-2xl border border-[#e8e7dc] bg-white p-5 shadow-[0_3px_12px_rgba(42,65,48,0.04)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-bold text-[#253b2d]">
                      #{order.orderId.slice(0, 8).toUpperCase()}
                    </p>
                    <p className="mt-1 text-sm text-[#667269]">
                      {new Date(order.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-extrabold tabular-nums text-[#294332]">
                      ${order.grandTotal.toFixed(2)}
                    </p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wide text-[#7d887b]">
                      {order.orderStatus.replaceAll("_", " ")} · {order.paymentStatus}
                    </p>
                  </div>
                </div>
                <ul className="mt-4 space-y-1 border-t border-[#ecebe2] pt-3 text-sm text-[#5f6b61]">
                  {order.items.map((item) => (
                    <li key={item.orderItemId} className="flex justify-between gap-4">
                      <span>
                        {item.productName}{" "}
                        <span className="text-[#899188]">× {item.quantity}</span>
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
  const [analytics, setAnalytics] = useState<SalesAnalytics | null>(null);
  const [salesLoading, setSalesLoading] = useState(true);
  const [salesError, setSalesError] = useState("");

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
          <h2 className="text-2xl font-extrabold text-[#294332]">Sales</h2>
          <p className="mt-1 text-sm text-[#667269]">Revenue breakdown, gross profit, and item performance over time.</p>
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
      ) : analytics && (
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <SalesPieChart title="Revenue by Top 8 Items" values={topSlices(analytics.items.map((item) => ({ name: item.name, value: item.revenue })), 8)} />
            <SalesPieChart title="Revenue by Top 3 Categories" values={topSlices(analytics.categories.map((category) => ({ name: category.name, value: category.revenue })), 3)} />
          </div>
          <SalesBarChart
            title="Sales"
            buckets={sales.map((bucket) => ({ bucketStart: bucket.bucketStart, value: bucket.revenue }))}
            range={salesRangeFor[dateRange]}
            formatValue={(value) => `$${value.toFixed(0)}`}
          />
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

const chartColors = ["#438254", "#91a95b", "#d4a449", "#cf7658", "#6e8da7", "#9c7bb4", "#4f9b91", "#b67b91", "#a8ad9b"];

function SalesPieChart({ title, values }: { title: string; values: PieSlice[] }) {
  const total = values.reduce((sum, item) => sum + item.value, 0);
  let angle = -90;
  let labelAngle = -90;

  return (
    <section className="min-w-0 rounded-2xl border border-[#e8e7dc] bg-white p-4 shadow-[0_3px_12px_rgba(42,65,48,0.04)] sm:p-5" aria-label={title}>
      <h3 className="text-lg font-extrabold text-[#294332]">{title}</h3>
      {total <= 0 ? (
        <p className="py-12 text-center text-sm text-[#7d887b]">No item sales in this range.</p>
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
                  className="fill-white text-[10px] font-bold [paint-order:stroke] [stroke:#294332] [stroke-width:2px]"
                >
                  {((item.value / total) * 100).toFixed(1)}%
                </text>
              );
            })}
          </svg>
          <ul className="grid w-full gap-2 text-sm">
            {values.map((item, index) => (
              <li key={item.name} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-[#536459]">
                  <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: chartColors[index % chartColors.length] }} />
                  <span className="truncate">{item.name}</span>
                </span>
                <span className="shrink-0 tabular-nums font-semibold text-[#294332]">
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
  const chartTop = 32;
  const chartBottom = 174;
  const baseline = chartTop + (maximum / span) * (chartBottom - chartTop);
  const labelInterval = Math.max(1, Math.ceil(buckets.length / 7));
  const hasValues = values.some((value) => value !== 0);
  const barWidth = Math.min(28, 420 / Math.max(values.length, 1));

  return (
    <section
      aria-label={`${title} chart`}
      className="min-w-0 rounded-2xl border border-[#e8e7dc] bg-white p-4 shadow-[0_3px_12px_rgba(42,65,48,0.04)] sm:p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold text-[#294332]">{title}</h2>
        <span className="text-sm font-bold tabular-nums text-[#426149]">{formatValue(values.reduce((sum, value) => sum + value, 0))}</span>
      </div>
      <svg
        viewBox="0 0 640 230"
        role="img"
        aria-label={`${title} bar chart for ${range}, showing ${buckets.length} time buckets`}
        className="mt-3 w-full"
      >
        {[0, 1, 2, 3].map((tick) => {
          const y = chartTop + tick * ((chartBottom - chartTop) / 3);
          const value = maximum - (tick / 3) * span;
          return (
            <g key={tick}>
              <line x1="56" x2="612" y1={y} y2={y} stroke="#ecebe2" strokeDasharray="4 5" />
              <text x="50" y={y + 4} textAnchor="end" fill="#7d887b" fontSize="11">{formatValue(value)}</text>
            </g>
          );
        })}
        <line x1="56" x2="612" y1={baseline} y2={baseline} stroke="#9ba797" />
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
                fill="#438254"
              >
                <title>{`${formatBucketLabel(bucket.bucketStart, range)}: ${formatValue(bucket.value)}`}</title>
              </rect>
              {(index % labelInterval === 0 || index === buckets.length - 1) && (
                <text x={centerX} y="204" textAnchor="middle" fill="#7d887b" fontSize="11">
                  {formatBucketLabel(bucket.bucketStart, range)}
                </text>
              )}
            </g>
          );
        })}
        {!hasValues && (
          <text x="332" y="112" textAnchor="middle" fill="#7d887b" fontSize="13">
            No paid sales in this range
          </text>
        )}
      </svg>
    </section>
  );
}

function SalesItemsTable({ items }: { items: SalesAnalytics["items"] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#e8e7dc] bg-white shadow-[0_3px_12px_rgba(42,65,48,0.04)]">
      <div className="border-b border-[#ecebe2] px-5 py-4 sm:px-7">
        <h3 className="text-lg font-extrabold text-[#294332]">Item sales and inventory</h3>
        <p className="mt-1 text-sm text-[#667269]">Units sold, revenue, and stock for every item.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[58rem] text-left">
          <thead className="bg-[#f6f7f1] text-xs uppercase tracking-wide text-[#667269]">
            <tr>
              <th scope="col" className="px-5 py-3 font-bold">Item</th>
              <th scope="col" className="px-4 py-3 font-bold">Category</th>
              <th scope="col" className="px-4 py-3 text-right font-bold">Quantity sold</th>
              <th scope="col" className="px-4 py-3 text-right font-bold">Revenue</th>
              <th scope="col" className="px-4 py-3 text-right font-bold">Current price</th>
              <th scope="col" className="px-4 py-3 text-right font-bold">Unit cost</th>
              <th scope="col" className="px-5 py-3 text-right font-bold">On hand</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ecebe2]">
            {items.map((item) => (
              <tr key={item.productId}>
                <th scope="row" className="px-5 py-4 font-semibold text-[#253b2d]">{item.name}</th>
                <td className="px-4 py-4 text-sm text-[#667269]">{item.category}</td>
                <td className="px-4 py-4 text-right text-sm tabular-nums">{item.quantity} {item.unit}</td>
                <td className="px-4 py-4 text-right text-sm tabular-nums">${item.revenue.toFixed(2)}</td>
                <td className="px-4 py-4 text-right text-sm tabular-nums">${item.currentPrice.toFixed(2)} / {item.unit}</td>
                <td className="px-4 py-4 text-right text-sm tabular-nums">{item.unitCost === null ? "Not set" : `$${item.unitCost.toFixed(2)}`}</td>
                <td className="px-5 py-4 text-right text-sm tabular-nums">{item.currentStock} {item.unit}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-sm text-[#667269]">No catalog items found.</td></tr>
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
