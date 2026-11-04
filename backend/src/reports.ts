import express from "express";
import type pg from "pg";
import { findCurrentUser, handle } from "./auth.js";
import { roundCents } from "./pricing.js";
import type { AuthStore, SalesRange } from "./store.js";

// Products at or below this many units count as running low, same as the dashboard.
export const LOW_STOCK_LIMIT = 10;
// Products in stock that haven't sold for this many days count as slow movers.
export const SLOW_MOVER_DAYS = 14;

export type InventoryReportProduct = {
  productId: string;
  name: string;
  category: string;
  unit: string;
  active: boolean;
  quantityInStock: number;
  price: number;
  unitCost: number | null;
  // Stock × unit cost; null when the product has no cost yet.
  stockValue: number | null;
  unitsSold: number;
  revenue: number;
  lastSoldAt: Date | null;
  // Stock ÷ average units sold per day in the range; null when nothing sold.
  daysOfStockLeft: number | null;
  status: "out" | "low" | "slow" | "ok";
};

export type StockMovement = {
  type: "restock" | "removal" | "sale" | "refund";
  // Managers' reasons for restocks and removals. Sales and refunds are grouped together.
  reason: string | null;
  quantity: number;
  count: number;
};

export type CategoryTrend = {
  category: string;
  revenue: number;
  // Null for "all time", which has no earlier period to compare against.
  previousRevenue: number | null;
};

export type InventoryReport = {
  range: SalesRange;
  rangeDays: number;
  summary: {
    stockValue: number;
    retailValue: number;
    productsWithoutCost: number;
    outOfStock: number;
    lowStock: number;
    slowMovers: number;
  };
  products: InventoryReportProduct[];
  movements: StockMovement[];
  categories: CategoryTrend[];
};

export type FailedPayment = {
  id: string;
  customerName: string;
  customerEmail: string;
  amount: number;
  failureCode: string | null;
  declineCode: string | null;
  message: string;
  failedAt: Date;
};

export type FailedPaymentsReport = {
  range: SalesRange;
  summary: {
    count: number;
    // Null for "all time".
    previousCount: number | null;
    amount: number;
    customers: number;
  };
  reasons: { reason: string; count: number }[];
  payments: FailedPayment[];
};

export type FailedPaymentRecord = {
  userId: string;
  paymentIntentId: string;
  // Stripe makes a charge for each declined attempt; it keeps one attempt from being saved twice.
  chargeId: string | null;
  amountCents: number;
  failureCode: string | null;
  declineCode: string | null;
  message: string;
};

export interface ReportsStore {
  inventoryReport(range: SalesRange): Promise<InventoryReport>;
  failedPaymentsReport(range: SalesRange): Promise<FailedPaymentsReport>;
  recordFailedPayment(failure: FailedPaymentRecord): Promise<void>;
}

export const emptyReportsStore: ReportsStore = {
  async inventoryReport(range) {
    return {
      range,
      rangeDays: 0,
      summary: { stockValue: 0, retailValue: 0, productsWithoutCost: 0, outOfStock: 0, lowStock: 0, slowMovers: 0 },
      products: [],
      movements: [],
      categories: [],
    };
  },
  async failedPaymentsReport(range) {
    return { range, summary: { count: 0, previousCount: null, amount: 0, customers: 0 }, reasons: [], payments: [] };
  },
  async recordFailedPayment() {},
};

const ranges = new Set<SalesRange>(["today", "week", "month", "all"]);

export function createReportsRouter({ store, reportsStore }: { store: AuthStore; reportsStore: ReportsStore }) {
  const router = express.Router();

  const readRange = async (req: express.Request, res: express.Response): Promise<SalesRange | null> => {
    const user = await findCurrentUser(store, req);
    if (!user) {
      res.status(401).json({ error: "Not logged in." });
      return null;
    }
    if (user.role !== "admin") {
      res.status(403).json({ error: "Manager access is required." });
      return null;
    }
    const range = req.query.range === undefined ? "week" : req.query.range;
    if (typeof range !== "string" || !ranges.has(range as SalesRange)) {
      res.status(400).json({ error: "Choose a valid report date range." });
      return null;
    }
    return range as SalesRange;
  };

  router.get("/inventory", handle(async (req, res) => {
    const range = await readRange(req, res);
    if (range) res.json({ report: await reportsStore.inventoryReport(range) });
  }));

  router.get("/failed-payments", handle(async (req, res) => {
    const range = await readRange(req, res);
    if (range) res.json({ report: await reportsStore.failedPaymentsReport(range) });
  }));

  return router;
}

export function stockStatus(quantityInStock: number, active: boolean, lastSoldAt: Date | null, now = new Date()): InventoryReportProduct["status"] {
  if (quantityInStock === 0) return "out";
  if (quantityInStock <= LOW_STOCK_LIMIT) return "low";
  const slowSince = now.getTime() - SLOW_MOVER_DAYS * 24 * 60 * 60 * 1000;
  if (active && (!lastSoldAt || lastSoldAt.getTime() < slowSince)) return "slow";
  return "ok";
}

// Days of stock left at the range's selling rate, rounded down to a whole day.
export function daysOfStockLeft(quantityInStock: number, unitsSold: number, rangeDays: number) {
  if (unitsSold <= 0 || rangeDays <= 0) return null;
  return Math.floor(quantityInStock / (unitsSold / rangeDays));
}

// Plain-language reason for a decline, from Stripe's codes.
export function failureReason(declineCode: string | null, failureCode: string | null) {
  const code = declineCode ?? failureCode;
  switch (code) {
    case "insufficient_funds": return "Insufficient funds";
    case "lost_card":
    case "stolen_card": return "Card reported lost or stolen";
    case "expired_card": return "Expired card";
    case "incorrect_cvc": return "Incorrect security code";
    case "processing_error": return "Processing error";
    case "card_velocity_exceeded": return "Too many attempts";
    case "fraudulent": return "Flagged as fraud";
    case "generic_decline":
    case "card_declined":
    case null: return "Card declined";
    default: return code.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
  }
}

export async function ensureFailedPaymentSchema(pool: pg.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS FailedPayment (
      failed_payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
      payment_intent_id VARCHAR(255) NOT NULL,
      failure_key VARCHAR(255) NOT NULL UNIQUE,
      amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
      failure_code VARCHAR(100),
      decline_code VARCHAR(100),
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS failed_payment_created_at_idx ON FailedPayment (created_at);
  `);
}

// Start of each range. "All time" starts at the first paid order, or a day ago if there isn't one.
const rangeStart: Record<SalesRange, string> = {
  today: "date_trunc('day', now())",
  week: "now() - interval '7 days'",
  month: "now() - interval '30 days'",
  all: "COALESCE((SELECT min(processed_at) FROM Payment WHERE payment_status = 'paid'), now() - interval '1 day')",
};

export function createPgReportsStore(pool: pg.Pool): ReportsStore {
  const bounds = (range: SalesRange) => `
    bounds AS (
      SELECT ${rangeStart[range]} AS start_at, now() AS end_at
    ), previous AS (
      SELECT start_at - (end_at - start_at) AS start_at, start_at AS end_at FROM bounds
    )`;

  return {
    async inventoryReport(range) {
      const productsQuery = pool.query<{
        productId: string; name: string; category: string; unit: string; active: boolean;
        quantityInStock: number; price: number; unitCost: number | null;
        unitsSold: number; revenue: number; lastSoldAt: Date | null; rangeDays: number;
      }>(
        `WITH ${bounds(range)},
         sold AS (
           SELECT oi.product_id, SUM(oi.quantity)::int AS units, SUM(oi.quantity * oi.price_at_purchase)::float8 AS revenue
           FROM Payment p
           JOIN OrderItem oi ON oi.order_id = p.order_id
           CROSS JOIN bounds b
           WHERE p.payment_status = 'paid' AND p.processed_at >= b.start_at AND p.processed_at < b.end_at
           GROUP BY oi.product_id
         ), last_sold AS (
           SELECT oi.product_id, max(p.processed_at) AS last_sold_at
           FROM Payment p
           JOIN OrderItem oi ON oi.order_id = p.order_id
           WHERE p.payment_status = 'paid'
           GROUP BY oi.product_id
         )
         SELECT p.product_id AS "productId", p.product_name AS name,
                COALESCE(c.category_name, 'Other') AS category, p.unit, p.active,
                p.quantity_in_stock AS "quantityInStock", p.price::float8 AS price,
                p.unit_cost::float8 AS "unitCost",
                COALESCE(s.units, 0) AS "unitsSold", COALESCE(s.revenue, 0)::float8 AS revenue,
                ls.last_sold_at AS "lastSoldAt",
                (SELECT EXTRACT(EPOCH FROM end_at - start_at) / 86400 FROM bounds)::float8 AS "rangeDays"
         FROM Product p
         LEFT JOIN Category c ON c.category_id = p.category_id
         LEFT JOIN sold s ON s.product_id = p.product_id
         LEFT JOIN last_sold ls ON ls.product_id = p.product_id
         ORDER BY p.active DESC, p.product_name`,
      );
      const movementsQuery = pool.query<StockMovement>(
        `WITH ${bounds(range)}
         SELECT t.transaction_type AS type,
                CASE WHEN t.transaction_type IN ('restock', 'removal') THEN COALESCE(NULLIF(t.reason, ''), 'Manual adjustment') END AS reason,
                SUM(t.quantity_changed)::int AS quantity, COUNT(*)::int AS count
         FROM Transactions t CROSS JOIN bounds b
         WHERE t.transaction_type IN ('restock', 'removal', 'sale', 'refund')
           AND t.created_at >= b.start_at AND t.created_at < b.end_at
         GROUP BY 1, 2
         ORDER BY abs(SUM(t.quantity_changed)) DESC`,
      );
      const categoriesQuery = pool.query<{ category: string; revenue: number; previousRevenue: number }>(
        `WITH ${bounds(range)}
         SELECT COALESCE(c.category_name, 'Other') AS category,
                COALESCE(SUM(oi.quantity * oi.price_at_purchase) FILTER (
                  WHERE p.processed_at >= (SELECT start_at FROM bounds) AND p.processed_at < (SELECT end_at FROM bounds)
                ), 0)::float8 AS revenue,
                COALESCE(SUM(oi.quantity * oi.price_at_purchase) FILTER (
                  WHERE p.processed_at >= (SELECT start_at FROM previous) AND p.processed_at < (SELECT end_at FROM previous)
                ), 0)::float8 AS "previousRevenue"
         FROM Product pr
         LEFT JOIN Category c ON c.category_id = pr.category_id
         LEFT JOIN OrderItem oi ON oi.product_id = pr.product_id
         LEFT JOIN Payment p ON p.order_id = oi.order_id AND p.payment_status = 'paid'
         GROUP BY 1
         ORDER BY revenue DESC, category`,
      );
      const [{ rows: productRows }, { rows: movements }, { rows: categoryRows }] =
        await Promise.all([productsQuery, movementsQuery, categoriesQuery]);

      const rangeDays = productRows[0]?.rangeDays ?? 0;
      const products = productRows.map(({ rangeDays: _days, ...product }): InventoryReportProduct => ({
        ...product,
        stockValue: product.unitCost === null ? null : roundCents(product.quantityInStock * product.unitCost),
        daysOfStockLeft: daysOfStockLeft(product.quantityInStock, product.unitsSold, rangeDays),
        status: stockStatus(product.quantityInStock, product.active, product.lastSoldAt),
      }));
      const active = products.filter((product) => product.active);

      return {
        range,
        rangeDays,
        summary: {
          stockValue: roundCents(active.reduce((total, product) => total + (product.stockValue ?? 0), 0)),
          retailValue: roundCents(active.reduce((total, product) => total + product.quantityInStock * product.price, 0)),
          productsWithoutCost: active.filter((product) => product.unitCost === null).length,
          outOfStock: active.filter((product) => product.status === "out").length,
          lowStock: active.filter((product) => product.status === "low").length,
          slowMovers: active.filter((product) => product.status === "slow").length,
        },
        products,
        movements,
        categories: categoryRows.map((category) => ({
          ...category,
          previousRevenue: range === "all" ? null : category.previousRevenue,
        })),
      };
    },

    async failedPaymentsReport(range) {
      const { rows: payments } = await pool.query<FailedPayment & { userId: string }>(
        `WITH ${bounds(range)}
         SELECT f.failed_payment_id AS id, f.user_id AS "userId",
                concat_ws(' ', u.first_name, u.last_name) AS "customerName", u.email AS "customerEmail",
                f.amount::float8 AS amount, f.failure_code AS "failureCode", f.decline_code AS "declineCode",
                f.message, f.created_at AS "failedAt"
         FROM FailedPayment f
         JOIN Users u ON u.user_id = f.user_id
         CROSS JOIN bounds b
         WHERE f.created_at >= b.start_at AND f.created_at < b.end_at
         ORDER BY f.created_at DESC`,
      );
      const { rows: [{ previousCount }] } = await pool.query<{ previousCount: number }>(
        `WITH ${bounds(range)}
         SELECT COUNT(*)::int AS "previousCount"
         FROM FailedPayment f CROSS JOIN previous p
         WHERE f.created_at >= p.start_at AND f.created_at < p.end_at`,
      );

      const reasonCounts = new Map<string, number>();
      for (const payment of payments) {
        const reason = failureReason(payment.declineCode, payment.failureCode);
        reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
      }

      return {
        range,
        summary: {
          count: payments.length,
          previousCount: range === "all" ? null : previousCount,
          amount: roundCents(payments.reduce((total, payment) => total + payment.amount, 0)),
          customers: new Set(payments.map((payment) => payment.userId)).size,
        },
        reasons: [...reasonCounts].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
        payments: payments.map(({ userId: _userId, ...payment }) => payment),
      };
    },

    async recordFailedPayment(failure) {
      await pool.query(
        `INSERT INTO FailedPayment (user_id, payment_intent_id, failure_key, amount, failure_code, decline_code, message)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (failure_key) DO NOTHING`,
        [
          failure.userId,
          failure.paymentIntentId,
          failure.chargeId ?? `${failure.paymentIntentId}:${failure.failureCode ?? "unknown"}`,
          failure.amountCents / 100,
          failure.failureCode,
          failure.declineCode,
          failure.message,
        ],
      );
    },
  };
}
