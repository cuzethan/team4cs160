import type pg from "pg";
import { DEFAULT_DELIVERY_SETTINGS, deliveryFeeFor, roundCents, type DeliverySettings } from "./pricing.js";

export type { DeliverySettings } from "./pricing.js";
export { DEFAULT_DELIVERY_SETTINGS } from "./pricing.js";

export interface SettingsStore {
  get(): Promise<DeliverySettings>;
  update(settings: DeliverySettings): Promise<DeliverySettings>;
}

// Postgres only runs docker-entrypoint-initdb.d scripts for an empty data volume.
// Create the singleton schema here too so upgrades work with persistent databases.
export async function ensureGlobalSettingsSchema(pool: pg.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS GlobalSettings (
      settings_id SMALLINT PRIMARY KEY CHECK (settings_id = 1),
      delivery_fee DECIMAL(10,2) NOT NULL CHECK (delivery_fee >= 0),
      free_delivery_weight_threshold DECIMAL(10,2) NOT NULL CHECK (free_delivery_weight_threshold > 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    INSERT INTO GlobalSettings (settings_id, delivery_fee, free_delivery_weight_threshold)
    VALUES (1, 10, 20)
    ON CONFLICT (settings_id) DO NOTHING
  `);
}

export function createPgSettingsStore(pool: pg.Pool): SettingsStore {
  return {
    async get() {
      const { rows } = await pool.query<DeliverySettings>(
        `SELECT delivery_fee::float8 AS "deliveryFee",
                free_delivery_weight_threshold::float8 AS "freeDeliveryWeightThreshold"
         FROM GlobalSettings WHERE settings_id = 1`,
      );
      return rows[0] ?? DEFAULT_DELIVERY_SETTINGS;
    },
    async update(settings) {
      const { rows } = await pool.query<DeliverySettings>(
        `INSERT INTO GlobalSettings (settings_id, delivery_fee, free_delivery_weight_threshold)
         VALUES (1, $1, $2)
         ON CONFLICT (settings_id) DO UPDATE
           SET delivery_fee = EXCLUDED.delivery_fee,
               free_delivery_weight_threshold = EXCLUDED.free_delivery_weight_threshold,
               updated_at = now()
         RETURNING delivery_fee::float8 AS "deliveryFee",
                   free_delivery_weight_threshold::float8 AS "freeDeliveryWeightThreshold"`,
        [settings.deliveryFee, settings.freeDeliveryWeightThreshold],
      );
      return rows[0];
    },
  };
}

export type Role = "customer" | "admin";

export type User = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  passwordHash: string;
  role: Role;
  accountStatus: "active" | "disabled";
  questionChoice: string;
  answerHash: string;
};

export type NewUser = Omit<User, "userId" | "accountStatus">;

export type CustomerRecord = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  accountStatus: "active" | "disabled";
  createdAt: Date;
};

export class EmailTakenError extends Error {
  constructor() {
    super("An account with this email already exists.");
  }
}

// Everything the auth routes need from the database. The Postgres version is
// used by the server; tests swap in an in-memory one.
export interface AuthStore {
  findUserByEmail(email: string): Promise<User | null>;
  listCustomers(): Promise<CustomerRecord[]>;
  createUser(user: NewUser): Promise<User>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;

  createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  findSessionUser(tokenHash: string): Promise<User | null>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;

  createResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  // Marks the token used and returns its user, or null if it is unknown, used or expired.
  consumeResetToken(tokenHash: string): Promise<string | null>;
}

const userColumns = `
  user_id AS "userId", first_name AS "firstName", last_name AS "lastName",
  email, phone, password_hash AS "passwordHash", role, account_status AS "accountStatus",
  question_choice AS "questionChoice", answer_hash AS "answerHash"
`;

export function createPgStore(pool: pg.Pool): AuthStore {
  return {
    async findUserByEmail(email) {
      const { rows } = await pool.query<User>(
        `SELECT ${userColumns} FROM users WHERE lower(email) = lower($1)`,
        [email],
      );
      return rows[0] ?? null;
    },

    async listCustomers() {
      const { rows } = await pool.query<CustomerRecord>(
        `SELECT user_id AS id, first_name AS "firstName", last_name AS "lastName",
                email, phone, account_status AS "accountStatus", created_at AS "createdAt"
         FROM users
         WHERE role = 'customer'
         ORDER BY last_name, first_name, email`,
      );
      return rows;
    },

    async createUser(user) {
      try {
        const { rows } = await pool.query<User>(
          `INSERT INTO users
             (first_name, last_name, email, phone, password_hash, role, question_choice, answer_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING ${userColumns}`,
          [
            user.firstName, user.lastName, user.email, user.phone,
            user.passwordHash, user.role, user.questionChoice, user.answerHash,
          ],
        );
        return rows[0];
      } catch (error) {
        if ((error as { code?: string }).code === "23505") throw new EmailTakenError();
        throw error;
      }
    },

    async updatePassword(userId, passwordHash) {
      await pool.query("UPDATE users SET password_hash = $2 WHERE user_id = $1", [userId, passwordHash]);
    },

    async createSession(userId, tokenHash, expiresAt) {
      await pool.query(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
        [tokenHash, userId, expiresAt],
      );
    },

    async findSessionUser(tokenHash) {
      const { rows } = await pool.query<User>(
        `SELECT ${userColumns} FROM sessions JOIN users USING (user_id)
         WHERE token_hash = $1 AND expires_at > now()`,
        [tokenHash],
      );
      return rows[0] ?? null;
    },

    async deleteSession(tokenHash) {
      await pool.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
    },

    async deleteUserSessions(userId) {
      await pool.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    },

    async createResetToken(userId, tokenHash, expiresAt) {
      await pool.query(
        "INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
        [tokenHash, userId, expiresAt],
      );
    },

    async consumeResetToken(tokenHash) {
      const { rows } = await pool.query<{ userId: string }>(
        `UPDATE password_reset_tokens SET used_at = now()
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
         RETURNING user_id AS "userId"`,
        [tokenHash],
      );
      return rows[0]?.userId ?? null;
    },
  };
}

// A product as shoppers see it in the catalog.
export type CatalogProduct = {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  weightLbs: number;
  unit: string;
  quantityInStock: number;
  imageUrl: string | null;
};

export interface ProductStore {
  // Active products only, ordered by category then name.
  listProducts(): Promise<CatalogProduct[]>;
  adjustStock(
    productId: string,
    adjustment: number,
  ): Promise<
    | { status: "updated"; quantityInStock: number }
    | { status: "not-found" }
    | { status: "insufficient-stock" }
    | { status: "maximum-stock" }
  >;
}

export type SalesRange = "today" | "week" | "month" | "all";

export type SalesBucket = {
  bucketStart: Date;
  paidOrders: number;
  revenue: number;
};

export type ManagerDelivery = {
  orderId: string;
  customerName: string;
  deliveryProgress: string;
  eta: Date | null;
};

export interface SalesStore {
  listSales(range: SalesRange): Promise<SalesBucket[]>;
}

export interface DeliveryStore {
  listDeliveries(): Promise<ManagerDelivery[]>;
}

export function createPgProductStore(pool: pg.Pool): ProductStore {
  return {
    async listProducts() {
      const { rows } = await pool.query<CatalogProduct>(
        `SELECT p.product_id AS id, p.product_name AS name, COALESCE(c.category_name, 'Other') AS category,
                COALESCE(p.description, '') AS description, p.price::float8 AS price,
                p.weight::float8 AS "weightLbs", p.unit, p.quantity_in_stock AS "quantityInStock",
                p.image_url AS "imageUrl"
         FROM Product p LEFT JOIN Category c ON c.category_id = p.category_id
         WHERE p.active
         ORDER BY category, p.product_name`,
      );
      return rows;
    },

    async adjustStock(productId, adjustment) {
      const { rows } = await pool.query<{ quantityInStock: number }>(
        `UPDATE Product
         SET quantity_in_stock = (quantity_in_stock::bigint + $2::bigint)::integer
         WHERE product_id = $1 AND active
           AND quantity_in_stock::bigint + $2::bigint BETWEEN 0 AND 2147483647
         RETURNING quantity_in_stock AS "quantityInStock"`,
        [productId, adjustment],
      );
      if (rows[0]) return { status: "updated", quantityInStock: rows[0].quantityInStock };

      const product = await pool.query<{ quantityInStock: number }>(
        `SELECT quantity_in_stock AS "quantityInStock"
         FROM Product WHERE product_id = $1 AND active`,
        [productId],
      );
      if (!product.rows[0]) return { status: "not-found" };

      const nextQuantity = product.rows[0].quantityInStock + adjustment;
      return nextQuantity < 0
        ? { status: "insufficient-stock" }
        : { status: "maximum-stock" };
    },
  };
}

export function createPgSalesStore(pool: pg.Pool): SalesStore {
  const ranges: Record<SalesRange, { start: string; end: string; step: string }> = {
    today: {
      start: "date_trunc('day', now())",
      end: "date_trunc('hour', now())",
      step: "interval '1 hour'",
    },
    week: {
      start: "date_trunc('day', now()) - interval '6 days'",
      end: "date_trunc('day', now())",
      step: "interval '1 day'",
    },
    month: {
      start: "date_trunc('day', now()) - interval '29 days'",
      end: "date_trunc('day', now())",
      step: "interval '1 day'",
    },
    all: {
      start: "COALESCE((SELECT date_trunc('month', min(processed_at)) FROM Payment WHERE payment_status = 'paid'), date_trunc('month', now()))",
      end: "date_trunc('month', now())",
      step: "interval '1 month'",
    },
  };

  return {
    async listSales(range) {
      const selectedRange = ranges[range];
      const { rows } = await pool.query<SalesBucket>(
        `WITH bounds AS (
           SELECT ${selectedRange.start} AS start_at, ${selectedRange.end} AS end_at,
                  ${selectedRange.step} AS bucket_step
         ), buckets AS (
           SELECT generate_series(start_at, end_at, bucket_step) AS bucket_start, bucket_step
           FROM bounds
         )
         SELECT b.bucket_start AS "bucketStart", COUNT(DISTINCT p.order_id)::int AS "paidOrders",
                COALESCE(SUM(p.payment_amount), 0)::float8 AS revenue
         FROM buckets b
         LEFT JOIN Payment p
           ON p.payment_status = 'paid'
          AND p.processed_at >= b.bucket_start
          AND p.processed_at < b.bucket_start + b.bucket_step
         GROUP BY b.bucket_start
         ORDER BY b.bucket_start`,
      );
      return rows;
    },
  };
}

export function createPgDeliveryStore(pool: pg.Pool): DeliveryStore {
  return {
    async listDeliveries() {
      const { rows } = await pool.query<ManagerDelivery>(
        `SELECT o.order_id AS "orderId",
                concat_ws(' ', u.first_name, u.last_name) AS "customerName",
                COALESCE(d.delivery_status, 'Awaiting dispatch') AS "deliveryProgress",
                d.estimated_delivery_time AS eta
         FROM Orders o
         JOIN Users u ON u.user_id = o.user_id
         LEFT JOIN LATERAL (
           SELECT delivery_status, estimated_delivery_time
           FROM Delivery
           WHERE order_id = o.order_id
           ORDER BY updated_at DESC, created_at DESC, delivery_id DESC
           LIMIT 1
         ) d ON true
         ORDER BY o.created_at DESC, o.order_id`,
      );
      return rows;
    },
  };
}

export type CartProduct = {
  productId: string;
  name: string;
  category: string;
  unit: string;
  price: number;
  weightLbs: number;
  quantityInStock: number;
  active: boolean;
};

export type CartLine = {
  cartItemId: string;
  productId: string;
  name: string;
  category: string;
  unit: string;
  price: number;
  weightLbs: number;
  quantityInStock: number;
  quantity: number;
};

// Everything the cart routes need from the database. Each user has at most one cart,
// created the first time they add something.
export interface CartStore {
  findProduct(productId: string): Promise<CartProduct | null>;
  listCartItems(userId: string): Promise<CartLine[]>;
  // Adds the product to the cart, or replaces its quantity if it's already there.
  setCartItemQuantity(userId: string, productId: string, quantity: number): Promise<void>;
  removeCartItem(userId: string, productId: string): Promise<void>;
}

export function createPgCartStore(pool: pg.Pool): CartStore {
  return {
    async findProduct(productId) {
      const { rows } = await pool.query<CartProduct>(
        `SELECT p.product_id AS "productId", p.product_name AS name,
                COALESCE(c.category_name, 'Other') AS category, p.unit, p.price::float8 AS price,
                p.weight::float8 AS "weightLbs", p.quantity_in_stock AS "quantityInStock", p.active
         FROM Product p LEFT JOIN Category c ON c.category_id = p.category_id
         WHERE p.product_id = $1`,
        [productId],
      );
      return rows[0] ?? null;
    },

    async listCartItems(userId) {
      const { rows } = await pool.query<CartLine>(
        `SELECT ci.cart_item_id AS "cartItemId", p.product_id AS "productId", p.product_name AS name,
                COALESCE(c.category_name, 'Other') AS category, p.unit, p.price::float8 AS price, p.weight::float8 AS "weightLbs",
                p.quantity_in_stock AS "quantityInStock", ci.quantity
         FROM ShoppingCart sc
         JOIN CartItems ci ON ci.cart_id = sc.cart_id
         JOIN Product p ON p.product_id = ci.product_id
         LEFT JOIN Category c ON c.category_id = p.category_id
         WHERE sc.user_id = $1
         ORDER BY p.product_name`,
        [userId],
      );
      return rows;
    },

    async setCartItemQuantity(userId, productId, quantity) {
      await pool.query(
        `WITH cart AS (
           INSERT INTO ShoppingCart (user_id) VALUES ($1)
           ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
           RETURNING cart_id
         )
         INSERT INTO CartItems (cart_id, product_id, quantity)
         SELECT cart_id, $2, $3 FROM cart
         ON CONFLICT (cart_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
        [userId, productId, quantity],
      );
    },

    async removeCartItem(userId, productId) {
      await pool.query(
        `DELETE FROM CartItems ci USING ShoppingCart sc
         WHERE ci.cart_id = sc.cart_id AND sc.user_id = $1 AND ci.product_id = $2`,
        [userId, productId],
      );
    },
  };
}

export type NewAddress = {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  deliveryInstructions: string;
};

export type SavedAddress = NewAddress;

export type OrderLine = {
  orderItemId: string;
  productId: string;
  productName: string;
  quantity: number;
  priceAtPurchase: number;
  weightAtPurchase: number;
};

export type OrderRecord = {
  orderId: string;
  createdAt: Date;
  orderStatus: string;
  paymentStatus: string;
  subtotal: number;
  deliveryFee: number;
  grandTotal: number;
  totalWeight: number;
  items: OrderLine[];
};

// Thrown when checkout can't go ahead; the message is safe to show the customer.
export class CheckoutError extends Error {}

export type CheckoutQuote = {
  subtotal: number;
  deliveryFee: number;
  grandTotal: number;
  totalWeight: number;
};

type PricedLine = {
  name: string;
  price: number;
  weight: number;
  stock: number;
  active: boolean;
  quantity: number;
};

// Same stock and pricing rules as placing an order, without writing anything.
export function quoteFromLines(lines: PricedLine[], settings: DeliverySettings = DEFAULT_DELIVERY_SETTINGS): CheckoutQuote {
  if (lines.length === 0) throw new CheckoutError("Your cart is empty.");
  for (const line of lines) {
    if (!line.active) throw new CheckoutError(`${line.name} is no longer available. Remove it to continue.`);
    if (line.quantity > line.stock) {
      throw new CheckoutError(`Only ${line.stock} of ${line.name} left in stock. Update your cart to continue.`);
    }
  }

  const subtotal = roundCents(lines.reduce((sum, line) => sum + line.price * line.quantity, 0));
  const totalWeight = roundCents(lines.reduce((sum, line) => sum + line.weight * line.quantity, 0));
  const deliveryFee = deliveryFeeFor(totalWeight, settings);
  return { subtotal, deliveryFee, grandTotal: roundCents(subtotal + deliveryFee), totalWeight };
}

export type PaidCheckout = {
  paymentIntentId: string;
  amountCents: number;
};

export interface OrderStore {
  getLatestAddress(userId: string): Promise<SavedAddress | null>;
  // Prices the cart the same way placeOrder will, so Stripe is charged the server total.
  quoteOrder(userId: string): Promise<CheckoutQuote>;
  // Turns the user's cart into a paid order in one transaction: checks stock, saves the
  // address, order, items and payment, takes the items out of stock, and empties the cart.
  placeOrder(userId: string, address: NewAddress, payment: PaidCheckout): Promise<OrderRecord>;
  listOrders(userId: string): Promise<OrderRecord[]>;
}

type OrderRow = Omit<OrderRecord, "items">;

const orderColumns = `
  o.order_id AS "orderId", o.created_at AS "createdAt", o.order_status AS "orderStatus",
  o.payment_status AS "paymentStatus", o.subtotal::float8 AS subtotal,
  o.delivery_fee::float8 AS "deliveryFee", o.grand_total::float8 AS "grandTotal",
  o.total_weight::float8 AS "totalWeight"
`;

async function loadOrderItems(client: pg.Pool | pg.PoolClient, orderIds: string[]) {
  const { rows } = await client.query<OrderLine & { orderId: string }>(
    `SELECT oi.order_id AS "orderId", oi.order_item_id AS "orderItemId", oi.product_id AS "productId",
            p.product_name AS "productName", oi.quantity,
            oi.price_at_purchase::float8 AS "priceAtPurchase", oi.weight_at_purchase::float8 AS "weightAtPurchase"
     FROM OrderItem oi JOIN Product p ON p.product_id = oi.product_id
     WHERE oi.order_id = ANY($1)
     ORDER BY p.product_name`,
    [orderIds],
  );
  return rows;
}

function attachItems(orders: OrderRow[], lines: (OrderLine & { orderId: string })[]): OrderRecord[] {
  return orders.map((order) => ({
    ...order,
    items: lines
      .filter((line) => line.orderId === order.orderId)
      .map(({ orderId: _orderId, ...line }) => line),
  }));
}

type CheckoutLine = PricedLine & { productId: string };

const checkoutLineSql = `
  SELECT p.product_id AS "productId", p.product_name AS name, p.price::float8 AS price,
         p.weight::float8 AS weight, p.quantity_in_stock AS stock, p.active, ci.quantity
  FROM ShoppingCart sc
  JOIN CartItems ci ON ci.cart_id = sc.cart_id
  JOIN Product p ON p.product_id = ci.product_id
  WHERE sc.user_id = $1
  ORDER BY p.product_id
`;

async function loadCheckoutLines(client: pg.Pool | pg.PoolClient, userId: string, lock: boolean) {
  const { rows } = await client.query<CheckoutLine>(
    lock ? `${checkoutLineSql} FOR UPDATE OF p` : checkoutLineSql,
    [userId],
  );
  return rows;
}

export function createPgOrderStore(pool: pg.Pool, settingsStore: SettingsStore = createPgSettingsStore(pool)): OrderStore {
  return {
    async getLatestAddress(userId) {
      const { rows } = await pool.query<SavedAddress>(
        `SELECT a.street, a.city, a.state, a.zip_code AS "zipCode",
                COALESCE(a.delivery_instructions, '') AS "deliveryInstructions"
         FROM Orders o
         JOIN Address a ON a.address_id = o.address_id
         WHERE o.user_id = $1
         ORDER BY o.created_at DESC, o.order_id DESC
         LIMIT 1`,
        [userId],
      );
      return rows[0] ?? null;
    },

    async quoteOrder(userId) {
      return quoteFromLines(await loadCheckoutLines(pool, userId, false), await settingsStore.get());
    },

    async placeOrder(userId, address, payment) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Lock the products being bought so two checkouts can't oversell the same stock.
        const lines = await loadCheckoutLines(client, userId, true);
        const { subtotal, totalWeight, deliveryFee, grandTotal } = quoteFromLines(lines, await settingsStore.get());
        if (Math.round(grandTotal * 100) !== payment.amountCents) {
          throw new CheckoutError("Your cart total changed. Refresh checkout and pay again.");
        }

        const { rows: [{ addressId }] } = await client.query<{ addressId: string }>(
          `INSERT INTO Address (user_id, street, city, state, zip_code, delivery_instructions)
           VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''))
           RETURNING address_id AS "addressId"`,
          [userId, address.street, address.city, address.state, address.zipCode, address.deliveryInstructions],
        );

        const { rows: [order] } = await client.query<OrderRow>(
          `INSERT INTO Orders AS o
             (user_id, address_id, order_status, payment_status, subtotal, delivery_fee, grand_total, total_weight)
           VALUES ($1, $2, 'placed', 'paid', $3, $4, $5, $6)
           RETURNING ${orderColumns}`,
          [userId, addressId, subtotal, deliveryFee, grandTotal, totalWeight],
        );

        for (const line of lines) {
          await client.query(
            `INSERT INTO OrderItem (order_id, product_id, quantity, price_at_purchase, weight_at_purchase)
             VALUES ($1, $2, $3, $4, $5)`,
            [order.orderId, line.productId, line.quantity, line.price, line.weight],
          );
          await client.query(
            `UPDATE Product SET quantity_in_stock = quantity_in_stock - $2, updated_at = now()
             WHERE product_id = $1`,
            [line.productId, line.quantity],
          );
          await client.query(
            `INSERT INTO Transactions (user_id, product_id, transaction_type, quantity_changed, quantity_after_change, reason)
             VALUES ($1, $2, 'sale', $3, $4, $5)`,
            [userId, line.productId, -line.quantity, line.stock - line.quantity, `Order ${order.orderId}`],
          );
        }

        await client.query(
          `INSERT INTO Payment (order_id, payment_amount, payment_status, payment_method, transaction_reference, processed_at)
           VALUES ($1, $2, 'paid', 'card', $3, now())`,
          [order.orderId, grandTotal, payment.paymentIntentId],
        );

        await client.query(
          "DELETE FROM CartItems WHERE cart_id = (SELECT cart_id FROM ShoppingCart WHERE user_id = $1)",
          [userId],
        );

        const items = await loadOrderItems(client, [order.orderId]);
        await client.query("COMMIT");
        return attachItems([order], items)[0];
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async listOrders(userId) {
      const { rows: orders } = await pool.query<OrderRow>(
        `SELECT ${orderColumns} FROM Orders o WHERE o.user_id = $1 ORDER BY o.created_at DESC`,
        [userId],
      );
      if (orders.length === 0) return [];
      return attachItems(orders, await loadOrderItems(pool, orders.map((order) => order.orderId)));
    },
  };
}
