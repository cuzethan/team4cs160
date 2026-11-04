import { useEffect, useState, type ReactNode } from "react";
import {
  fetchFailedPaymentsReport,
  fetchInventoryReport,
  type FailedPaymentsReport,
  type InventoryReport,
  type SalesRange,
  type StockStatus,
} from "./api";

const rangeOptions: { value: SalesRange; label: string; comparedTo: string }[] = [
  { value: "today", label: "Today", comparedTo: "yesterday" },
  { value: "week", label: "Last week", comparedTo: "the week before" },
  { value: "month", label: "Last 30 days", comparedTo: "the 30 days before" },
  { value: "all", label: "All time", comparedTo: "" },
];

const cardClassName = "rounded-2xl border border-[#e8e7dc] bg-white shadow-[0_3px_12px_rgba(42,65,48,0.04)]";
const headCellClassName = "px-4 py-3 font-bold";
const money = (value: number) => `$${value.toFixed(2)}`;
const dateTime = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const shortDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

// Loads a report again whenever the range changes, dropping answers for an older range.
function useReport<T>(load: (range: SalesRange) => Promise<T>, range: SalesRange) {
  const [report, setReport] = useState<T | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setReport(null);
    setError("");
    load(range)
      .then((value) => active && setReport(value))
      .catch((loadError: Error) => active && setError(loadError.message));
    return () => {
      active = false;
    };
  }, [load, range]);

  return { report, error };
}

function ReportHeader({ title, description, range, onRangeChange }: {
  title: string;
  description: string;
  range: SalesRange;
  onRangeChange: (range: SalesRange) => void;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-2xl font-extrabold text-[#294332]">{title}</h2>
        <p className="mt-1 text-sm text-[#667269]">{description}</p>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold text-[#426149]">
        Date range
        <select
          value={range}
          onChange={(event) => onRangeChange(event.target.value as SalesRange)}
          className="rounded-lg border border-[#dce2d5] bg-white px-3 py-2 text-[#253b2d] shadow-sm"
        >
          {rangeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    </div>
  );
}

function MetricCard({ label, value, detail, tone = "normal" }: {
  label: string;
  value: string;
  detail: ReactNode;
  tone?: "normal" | "warning";
}) {
  return (
    <article className={`${cardClassName} p-4 sm:p-5`}>
      <h3 className="text-sm font-bold text-[#667269]">{label}</h3>
      <p className={`mt-2 text-2xl font-extrabold tabular-nums sm:text-3xl ${tone === "warning" ? "text-[#8b5145]" : "text-[#294332]"}`}>{value}</p>
      <p className="mt-1 text-xs text-[#7d887b] sm:text-sm">{detail}</p>
    </article>
  );
}

// ▲ / ▼ with the percent change. `higherIsGood` decides which way is green.
export function Trend({ current, previous, higherIsGood }: { current: number; previous: number | null; higherIsGood: boolean }) {
  if (previous === null) return null;
  if (previous === 0) {
    if (current === 0) return <span className="text-[#899188]">No change</span>;
    return <span className={higherIsGood ? "text-[#2f7a45]" : "text-[#b0452f]"}>New</span>;
  }
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < 0.5) return <span className="text-[#899188]">No change</span>;
  const good = change > 0 === higherIsGood;
  return (
    <span className={`font-semibold ${good ? "text-[#2f7a45]" : "text-[#b0452f]"}`}>
      <span aria-hidden="true">{change > 0 ? "▲" : "▼"}</span> {change > 0 ? "up" : "down"} {Math.abs(change).toFixed(0)}%
    </span>
  );
}

const statusLabels: Record<StockStatus, { label: string; className: string }> = {
  out: { label: "Out of stock", className: "bg-[#f8e4df] text-[#8b5145]" },
  low: { label: "Running low", className: "bg-[#fbf0d9] text-[#7a5a17]" },
  slow: { label: "Slow mover", className: "bg-[#e8eef5] text-[#3d5a78]" },
  ok: { label: "OK", className: "bg-[#e9f1df] text-[#416449]" },
};

const movementLabels: Record<InventoryReport["movements"][number]["type"], string> = {
  sale: "Sold to customers",
  refund: "Returned by refunds",
  restock: "Restocked",
  removal: "Removed",
};

// Stock value, what's running out, what isn't selling, and how stock moved in the range.
export function InventoryReportPanel() {
  const [range, setRange] = useState<SalesRange>("week");
  const [view, setView] = useState<"attention" | "all">("attention");
  const { report, error } = useReport(fetchInventoryReport, range);
  const comparedTo = rangeOptions.find((option) => option.value === range)?.comparedTo;

  const activeProducts = report?.products.filter((product) => product.active) ?? [];
  const shownProducts = view === "attention"
    ? activeProducts.filter((product) => product.status !== "ok")
    : activeProducts;

  return (
    <div className="flex flex-col gap-6">
      <ReportHeader
        title="Stock report"
        description="What your stock is worth, what's running out, and what isn't selling."
        range={range}
        onRangeChange={setRange}
      />
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700">{error}</p>}
      {!report && !error && <p role="status" className={`${cardClassName} p-6 text-sm text-[#667269]`}>Loading stock report…</p>}

      {report && (
        <>
          <section aria-label="Stock summary" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <MetricCard
              label="Stock value (at cost)"
              value={money(report.summary.stockValue)}
              detail={report.summary.productsWithoutCost > 0
                ? `${report.summary.productsWithoutCost} product${report.summary.productsWithoutCost === 1 ? " has" : "s have"} no cost set`
                : `${money(report.summary.retailValue)} at selling price`}
            />
            <MetricCard
              label="Out of stock"
              value={String(report.summary.outOfStock)}
              detail="Can't be bought right now"
              tone={report.summary.outOfStock > 0 ? "warning" : "normal"}
            />
            <MetricCard label="Running low" value={String(report.summary.lowStock)} detail="10 or fewer left" />
            <MetricCard label="Slow movers" value={String(report.summary.slowMovers)} detail="No sales in 14+ days" />
          </section>

          <div className="grid items-start gap-6 xl:grid-cols-2">
            <section aria-labelledby="category-trend-heading" className={`${cardClassName} overflow-hidden`}>
              <div className="border-b border-[#ecebe2] px-5 py-4 sm:px-6">
                <h3 id="category-trend-heading" className="text-lg font-extrabold text-[#294332]">Sales by category</h3>
                <p className="mt-1 text-sm text-[#667269]">{comparedTo ? `Compared with ${comparedTo}.` : "Since the first order."}</p>
              </div>
              <ul className="divide-y divide-[#ecebe2]">
                {report.categories.map((category) => (
                  <li key={category.category} className="flex items-center justify-between gap-4 px-5 py-3 text-sm sm:px-6">
                    <span className="font-semibold text-[#253b2d]">{category.category}</span>
                    <span className="flex items-center gap-4 tabular-nums">
                      <Trend current={category.revenue} previous={category.previousRevenue} higherIsGood />
                      <span className="w-20 text-right font-bold text-[#294332]">{money(category.revenue)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="movement-heading" className={`${cardClassName} overflow-hidden`}>
              <div className="border-b border-[#ecebe2] px-5 py-4 sm:px-6">
                <h3 id="movement-heading" className="text-lg font-extrabold text-[#294332]">Stock movement</h3>
                <p className="mt-1 text-sm text-[#667269]">Units in and out, with the reasons managers gave.</p>
              </div>
              {report.movements.length === 0 ? (
                <p className="px-5 py-6 text-sm text-[#667269] sm:px-6">No stock changes in this range.</p>
              ) : (
                <ul className="divide-y divide-[#ecebe2]">
                  {report.movements.map((movement) => (
                    <li key={`${movement.type}-${movement.reason ?? ""}`} className="flex items-center justify-between gap-4 px-5 py-3 text-sm sm:px-6">
                      <span className="min-w-0">
                        <span className="font-semibold text-[#253b2d]">{movementLabels[movement.type]}</span>
                        {movement.reason && <span className="text-[#667269]"> · {movement.reason}</span>}
                        <span className="block text-xs text-[#899188]">{movement.count} {movement.count === 1 ? "change" : "changes"}</span>
                      </span>
                      <span className={`shrink-0 font-bold tabular-nums ${movement.quantity < 0 ? "text-[#8b5145]" : "text-[#2f7a45]"}`}>
                        {movement.quantity > 0 ? "+" : ""}{movement.quantity}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section aria-labelledby="stock-products-heading" className={`${cardClassName} overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ecebe2] px-5 py-4 sm:px-6">
              <div>
                <h3 id="stock-products-heading" className="text-lg font-extrabold text-[#294332]">Products</h3>
                <p className="mt-1 text-sm text-[#667269]">Days left assumes items keep selling at this range's pace.</p>
              </div>
              <div role="group" aria-label="Products shown" className="flex rounded-full border border-[#dce2d5] p-1 text-sm font-bold">
                {(["attention", "all"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={view === option}
                    onClick={() => setView(option)}
                    className={`rounded-full px-3 py-1.5 ${view === option ? "bg-[#e9f1df] text-[#2e4935]" : "text-[#667269] hover:text-[#2e4935]"}`}
                  >
                    {option === "attention" ? "Needs attention" : "All products"}
                  </button>
                ))}
              </div>
            </div>
            {shownProducts.length === 0 ? (
              <p className="px-5 py-6 text-sm text-[#667269] sm:px-6">Nothing needs attention right now.</p>
            ) : (
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[46rem] text-left text-sm">
                  <thead className="bg-[#f6f7f1] text-xs uppercase tracking-wide text-[#667269]">
                    <tr>
                      <th scope="col" className={`${headCellClassName} sm:px-6`}>Product</th>
                      <th scope="col" className={headCellClassName}>Status</th>
                      <th scope="col" className={`${headCellClassName} text-right`}>In stock</th>
                      <th scope="col" className={`${headCellClassName} text-right`}>Sold</th>
                      <th scope="col" className={`${headCellClassName} text-right`}>Days left</th>
                      <th scope="col" className={`${headCellClassName} text-right`}>Last sold</th>
                      <th scope="col" className={`${headCellClassName} text-right sm:px-6`}>Stock value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#ecebe2]">
                    {shownProducts.map((product) => (
                      <tr key={product.productId}>
                        <th scope="row" className="px-4 py-3 font-semibold text-[#253b2d] sm:px-6">
                          {product.name}
                          <span className="block text-xs font-normal text-[#899188]">{product.category}</span>
                        </th>
                        <td className="px-4 py-3">
                          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${statusLabels[product.status].className}`}>
                            {statusLabels[product.status].label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{product.quantityInStock} <span className="text-[#899188]">{product.unit}</span></td>
                        <td className="px-4 py-3 text-right tabular-nums">{product.unitsSold}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {product.quantityInStock === 0 ? "—" : product.daysOfStockLeft === null ? <span className="text-[#899188]">No recent sales</span> : product.daysOfStockLeft}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {product.lastSoldAt ? shortDate.format(new Date(product.lastSoldAt)) : <span className="text-[#899188]">Never</span>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums sm:px-6">
                          {product.stockValue === null ? <span className="text-[#899188]">No cost</span> : money(product.stockValue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// Card payments Stripe declined at checkout: how many, how much, and why.
export function FailedPaymentsPanel() {
  const [range, setRange] = useState<SalesRange>("week");
  const { report, error } = useReport(fetchFailedPaymentsReport, range);
  const comparedTo = rangeOptions.find((option) => option.value === range)?.comparedTo;
  const topReasonCount = report?.reasons[0]?.count ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <ReportHeader
        title="Failed payments"
        description="Cards that were declined at checkout. No order is placed and nothing is charged."
        range={range}
        onRangeChange={setRange}
      />
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700">{error}</p>}
      {!report && !error && <p role="status" className={`${cardClassName} p-6 text-sm text-[#667269]`}>Loading failed payments…</p>}

      {report && (
        <>
          <section aria-label="Failed payments summary" className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            <MetricCard
              label="Failed payments"
              value={String(report.summary.count)}
              detail={report.summary.previousCount === null
                ? "Since tracking started"
                : <><Trend current={report.summary.count} previous={report.summary.previousCount} higherIsGood={false} /> vs {comparedTo}</>}
              tone={report.summary.count > 0 ? "warning" : "normal"}
            />
            <MetricCard label="Amount declined" value={money(report.summary.amount)} detail="Sales that didn't go through" />
            <MetricCard label="Customers affected" value={String(report.summary.customers)} detail="Had at least one decline" />
          </section>

          {report.payments.length === 0 ? (
            <p className={`${cardClassName} p-6 text-sm text-[#667269]`}>No declined payments in this range.</p>
          ) : (
            <div className="grid items-start gap-6 xl:grid-cols-[minmax(16rem,1fr)_minmax(0,2fr)]">
              <section aria-labelledby="decline-reasons-heading" className={`${cardClassName} p-5 sm:p-6`}>
                <h3 id="decline-reasons-heading" className="text-lg font-extrabold text-[#294332]">Why they failed</h3>
                <ul className="mt-4 space-y-3">
                  {report.reasons.map((reason) => (
                    <li key={reason.reason} className="text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="font-semibold text-[#253b2d]">{reason.reason}</span>
                        <span className="tabular-nums text-[#667269]">{reason.count}</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-[#f1f0e8]">
                        <div className="h-2 rounded-full bg-[#cf7658]" style={{ width: `${(reason.count / topReasonCount) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              <section aria-labelledby="declines-heading" className={`${cardClassName} min-w-0 overflow-hidden`}>
                <h3 id="declines-heading" className="border-b border-[#ecebe2] px-5 py-4 text-lg font-extrabold text-[#294332] sm:px-6">Declines</h3>
                <div className="relative overflow-x-auto">
                  <table className="w-full min-w-[40rem] text-left text-sm">
                    <thead className="bg-[#f6f7f1] text-xs uppercase tracking-wide text-[#667269]">
                      <tr>
                        <th scope="col" className={`${headCellClassName} sm:px-6`}>When</th>
                        <th scope="col" className={headCellClassName}>Customer</th>
                        <th scope="col" className={headCellClassName}>Reason</th>
                        <th scope="col" className={`${headCellClassName} text-right sm:px-6`}>Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#ecebe2]">
                      {report.payments.map((payment) => (
                        <tr key={payment.id}>
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums sm:px-6">{dateTime.format(new Date(payment.failedAt))}</td>
                          <th scope="row" className="px-4 py-3 font-semibold text-[#253b2d]">
                            {payment.customerName}
                            <span className="block text-xs font-normal text-[#899188]">{payment.customerEmail}</span>
                          </th>
                          <td className="px-4 py-3 text-[#536459]">{payment.message}</td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums sm:px-6">{money(payment.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
