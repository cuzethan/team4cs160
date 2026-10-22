import type pg from "pg";
import { getRobotBaseLocation } from "./robotBase.js";
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

// Same reason as above: links price history rows to their product and the manager
// who changed it, on databases created before db/init/006_inventory_management.sql.
export async function ensureInventoryManagementSchema(pool: pg.Pool) {
  await pool.query(`
    ALTER TABLE PriceHistory
      ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES Product(product_id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS changed_by UUID REFERENCES Users(user_id) ON DELETE SET NULL
  `);
}

// Delivery tables exist in the original schema. These additions bring existing
// persistent databases up to date as well as documenting the upgrade in db/init.
export async function ensureDeliveryTrackingSchema(pool: pg.Pool) {
  const base = getRobotBaseLocation();
  await pool.query(`
    ALTER TABLE Robot
      ALTER COLUMN maximum_orders SET DEFAULT 10,
      ALTER COLUMN maximum_weight SET DEFAULT 200
  `);
  await pool.query(`
    ALTER TABLE DeliveryRun
      ADD COLUMN IF NOT EXISTS route_geometry JSONB,
      ADD COLUMN IF NOT EXISTS route_source VARCHAR(30),
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  `);
  await pool.query(`
    ALTER TABLE Notification
      ADD COLUMN IF NOT EXISTS notification_type VARCHAR(50) NOT NULL DEFAULT 'delivery_update',
      ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS delivery_order_status_idx ON Delivery(delivery_status, order_id);
    CREATE INDEX IF NOT EXISTS delivery_run_status_idx ON DeliveryRun(run_status, robot_id);
    CREATE INDEX IF NOT EXISTS delivery_run_simulation_idx ON DeliveryRun(run_status, created_at);
    CREATE INDEX IF NOT EXISTS notification_user_created_idx ON Notification(user_id, created_at DESC)
  `);
  await pool.query(`
    DROP INDEX IF EXISTS delivery_single_assignment_idx;
    CREATE UNIQUE INDEX delivery_single_assignment_idx ON Delivery(order_id) WHERE delivery_status <> 'cancelled'
  `);
  await pool.query(`
    COMMENT ON COLUMN DeliveryRun.route_distance IS 'Route distance in meters';
    COMMENT ON COLUMN DeliveryRun.estimated_duration IS 'Estimated route duration in seconds'
  `);
  await pool.query(`
    INSERT INTO Robot (robot_name, robot_status, maximum_orders, maximum_weight, current_latitude, current_longitude)
    SELECT 'Demo Robot 1', 'available', 10, 200, $1, $2
    WHERE NOT EXISTS (SELECT 1 FROM Robot)
  `, [base.latitude, base.longitude]);
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
  findCustomer(customerId: string): Promise<CustomerRecord | null>;
  // Suspends or restores a customer. Returns null when the id is not a customer.
  setCustomerAccountStatus(
    customerId: string,
    accountStatus: CustomerRecord["accountStatus"],
  ): Promise<CustomerRecord | null>;
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

    async findCustomer(customerId) {
      if (!UUID_PATTERN.test(customerId)) return null;
      const { rows } = await pool.query<CustomerRecord>(
        `SELECT user_id AS id, first_name AS "firstName", last_name AS "lastName",
                email, phone, account_status AS "accountStatus", created_at AS "createdAt"
         FROM users
         WHERE user_id = $1 AND role = 'customer'`,
        [customerId],
      );
      return rows[0] ?? null;
    },

    async setCustomerAccountStatus(customerId, accountStatus) {
      if (!UUID_PATTERN.test(customerId)) return null;
      const { rows } = await pool.query<CustomerRecord>(
        `UPDATE users
         SET account_status = $2, updated_at = now()
         WHERE user_id = $1 AND role = 'customer'
         RETURNING user_id AS id, first_name AS "firstName", last_name AS "lastName",
                   email, phone, account_status AS "accountStatus", created_at AS "createdAt"`,
        [customerId, accountStatus],
      );
      return rows[0] ?? null;
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

// A product as managers see it: includes deactivated products and the category id.
export type ManagedProduct = CatalogProduct & {
  categoryId: string | null;
  active: boolean;
};

export type ProductCategory = { id: string; name: string };

export type NewProduct = {
  name: string;
  description: string;
  price: number;
  weightLbs: number;
  unit: string;
  categoryId: string;
  quantityInStock: number;
};

export type ProductChanges = Partial<Omit<NewProduct, "quantityInStock">> & { active?: boolean };

// Who changed stock and why; saved to the Transactions table.
export type StockChange = { userId: string; reason: string };

export interface ProductStore {
  // Active products only, ordered by category then name.
  listProducts(): Promise<CatalogProduct[]>;
  // Every product, including deactivated ones, for the manager dashboard.
  listManagedProducts(): Promise<ManagedProduct[]>;
  listCategories(): Promise<ProductCategory[]>;
  createProduct(userId: string, product: NewProduct): Promise<ManagedProduct>;
  // Null when the product doesn't exist. Price changes are saved to PriceHistory.
  updateProduct(userId: string, productId: string, changes: ProductChanges): Promise<ManagedProduct | null>;
  adjustStock(
    productId: string,
    adjustment: number,
    change: StockChange,
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

export type DeliveryRobot = {
  robotId: string;
  robotName: string;
  status: string;
  maximumOrders: number;
  maximumWeight: number;
  currentLatitude: number | null;
  currentLongitude: number | null;
  lastUpdated: Date;
};

export type UnassignedPaidOrder = {
  orderId: string;
  customerId: string;
  addressId: string;
  totalWeight: number;
  createdAt: Date;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  latitude: number | null;
  longitude: number | null;
};

export type DeliveryRun = {
  runId: string;
  robotId: string;
  robotName: string;
  status: string;
  routeDistanceMeters: number | null;
  estimatedDurationSeconds: number | null;
  routeGeometry: [number, number][] | null;
  routeSource: "valhalla" | "approximate" | null;
  startedAt: Date | null;
  completedAt: Date | null;
  stops: { orderId: string; stopNumber: number; status: string; eta: Date | null; latitude: number | null; longitude: number | null }[];
};

export type DeliveryTracking = {
  orderId: string;
  orderStatus: string;
  deliveryStatus: string | null;
  eta: Date | null;
  stopNumber: number | null;
  runId: string | null;
  routeGeometry: [number, number][] | null;
  routeSource: "valhalla" | "approximate" | null;
  robotName: string | null;
  robotStatus: string | null;
  robotLatitude: number | null;
  robotLongitude: number | null;
};

export type DeliveryNotification = {
  notificationId: string;
  orderId: string | null;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
  readAt: Date | null;
};

export type ReceiptResult = "completed" | "not-found" | "not-delivered";
export type CancelRunResult = "cancelled" | "not-found" | "not-active";

export type NewDeliveryRun = {
  robotId: string;
  routeDistanceMeters: number;
  estimatedDurationSeconds: number;
  routeGeometry: [number, number][];
  routeSource: "valhalla" | "approximate";
  stops: { orderId: string; estimatedDeliveryTime: Date }[];
};

export type SimulatableDeliveryRun = {
  runId: string;
  robotId: string;
  createdAt: Date;
  estimatedDurationSeconds: number;
  routeGeometry: [number, number][];
  stops: { orderId: string; stopNumber: number; eta: Date; status: string }[];
};

export type SimulationTick = {
  runId: string;
  latitude: number;
  longitude: number;
  arrivedStopNumbers: number[];
  completed: boolean;
  occurredAt: Date;
};

export class DeliveryAssignmentError extends Error {
  constructor(readonly reason: "robot-unavailable" | "orders-unavailable" | "capacity-exceeded") {
    super(reason);
  }
}

const MAX_DELIVERY_RUN_ORDERS = 10;
const MAX_DELIVERY_RUN_WEIGHT_LBS = 200;

export interface SalesStore {
  listSales(range: SalesRange): Promise<SalesBucket[]>;
}

export interface DeliveryStore {
  listDeliveries(): Promise<ManagerDelivery[]>;
  listRobots?(): Promise<DeliveryRobot[]>;
  listRuns?(): Promise<DeliveryRun[]>;
  cancelDeliveryRun?(runId: string): Promise<CancelRunResult>;
  getCustomerTracking?(userId: string, orderId: string): Promise<DeliveryTracking | null>;
  confirmOrderReceived?(userId: string, orderId: string): Promise<ReceiptResult>;
  listNotifications?(userId: string): Promise<DeliveryNotification[]>;
  markNotificationRead?(userId: string, notificationId: string): Promise<boolean>;
  createNotification?(userId: string, orderId: string | null, type: string, message: string): Promise<DeliveryNotification>;
  createDeliveryRun?(run: NewDeliveryRun): Promise<string>;
  updateRobotPosition?(robotId: string, latitude: number, longitude: number): Promise<boolean>;
  listUnassignedPaidOrders?(): Promise<UnassignedPaidOrder[]>;
  saveAddressCoordinates?(addressId: string, latitude: number, longitude: number): Promise<boolean>;
  listSimulatableRuns?(): Promise<SimulatableDeliveryRun[]>;
  recordSimulationTick?(tick: SimulationTick): Promise<void>;
}

// Postgres rejects malformed UUIDs with an error, so treat them as "not found" up front.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const managedProductColumns = `
  p.product_id AS id, p.product_name AS name, COALESCE(c.category_name, 'Other') AS category,
  COALESCE(p.description, '') AS description, p.price::float8 AS price,
  p.weight::float8 AS "weightLbs", p.unit, p.quantity_in_stock AS "quantityInStock",
  p.image_url AS "imageUrl", p.category_id AS "categoryId", p.active`;

async function findManagedProduct(pool: pg.Pool, productId: string) {
  const { rows } = await pool.query<ManagedProduct>(
    `SELECT ${managedProductColumns}
     FROM Product p LEFT JOIN Category c ON c.category_id = p.category_id
     WHERE p.product_id = $1`,
    [productId],
  );
  return rows[0] ?? null;
}

// A short, readable summary for the audit log, e.g. "price $1.49 → $1.79, deactivated".
export function describeProductChanges(before: ManagedProduct, after: ManagedProduct) {
  const changes: string[] = [];
  if (after.name !== before.name) changes.push(`renamed to ${after.name}`);
  if (after.price !== before.price) changes.push(`price $${before.price.toFixed(2)} → $${after.price.toFixed(2)}`);
  if (after.weightLbs !== before.weightLbs) changes.push(`weight ${before.weightLbs} → ${after.weightLbs} lb`);
  if (after.unit !== before.unit) changes.push(`unit ${before.unit} → ${after.unit}`);
  if (after.categoryId !== before.categoryId) changes.push("category changed");
  if (after.description !== before.description) changes.push("description updated");
  if (after.active !== before.active) changes.push(after.active ? "reactivated" : "deactivated");
  return changes.join(", ");
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

    async listManagedProducts() {
      const { rows } = await pool.query<ManagedProduct>(
        `SELECT ${managedProductColumns}
         FROM Product p LEFT JOIN Category c ON c.category_id = p.category_id
         ORDER BY p.active DESC, category, p.product_name`,
      );
      return rows;
    },

    async listCategories() {
      const { rows } = await pool.query<ProductCategory>(
        "SELECT category_id AS id, category_name AS name FROM Category ORDER BY category_name",
      );
      return rows;
    },

    async createProduct(userId, product) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows: [{ productId }] } = await client.query<{ productId: string }>(
          `INSERT INTO Product (product_name, description, price, weight, unit, category_id, quantity_in_stock)
           VALUES ($1, NULLIF($2, ''), $3, $4, $5, $6, $7)
           RETURNING product_id AS "productId"`,
          [product.name, product.description, product.price, product.weightLbs, product.unit,
            product.categoryId, product.quantityInStock],
        );
        if (product.quantityInStock > 0) {
          await client.query(
            `INSERT INTO Transactions (user_id, product_id, transaction_type, quantity_changed, quantity_after_change, reason)
             VALUES ($1, $2, 'restock', $3, $3, 'Initial stock')`,
            [userId, productId, product.quantityInStock],
          );
        }
        await client.query(
          `INSERT INTO AuditLog (user_id, affected_table, affected_record_id, description)
           VALUES ($1, 'Product', $2, $3)`,
          [userId, productId, `Added product ${product.name}`],
        );
        await client.query("COMMIT");
        return (await findManagedProduct(pool, productId))!;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async updateProduct(userId, productId, changes) {
      if (!UUID_PATTERN.test(productId)) return null;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows: [current] } = await client.query<ManagedProduct>(
          `SELECT ${managedProductColumns}
           FROM Product p LEFT JOIN Category c ON c.category_id = p.category_id
           WHERE p.product_id = $1 FOR UPDATE OF p`,
          [productId],
        );
        if (!current) {
          await client.query("ROLLBACK");
          return null;
        }

        const next = { ...current, ...changes };
        await client.query(
          `UPDATE Product
           SET product_name = $2, description = NULLIF($3, ''), price = $4, weight = $5, unit = $6,
               category_id = $7, active = $8, updated_at = now()
           WHERE product_id = $1`,
          [productId, next.name, next.description, next.price, next.weightLbs, next.unit, next.categoryId, next.active],
        );
        if (next.price !== current.price) {
          await client.query(
            "INSERT INTO PriceHistory (product_id, changed_by, old_price, new_price) VALUES ($1, $2, $3, $4)",
            [productId, userId, current.price, next.price],
          );
        }
        const summary = describeProductChanges(current, next);
        if (summary) {
          await client.query(
            `INSERT INTO AuditLog (user_id, affected_table, affected_record_id, description)
             VALUES ($1, 'Product', $2, $3)`,
            [userId, productId, `${current.name}: ${summary}`],
          );
        }
        await client.query("COMMIT");
        return (await findManagedProduct(pool, productId))!;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async adjustStock(productId, adjustment, change) {
      if (!UUID_PATTERN.test(productId)) return { status: "not-found" };

      // Deactivated products can be restocked too, so they're ready when turned back on.
      const { rows } = await pool.query<{ quantityInStock: number }>(
        `WITH updated AS (
           UPDATE Product
           SET quantity_in_stock = (quantity_in_stock::bigint + $2::bigint)::integer, updated_at = now()
           WHERE product_id = $1
             AND quantity_in_stock::bigint + $2::bigint BETWEEN 0 AND 2147483647
           RETURNING product_id, quantity_in_stock
         ), logged AS (
           INSERT INTO Transactions (user_id, product_id, transaction_type, quantity_changed, quantity_after_change, reason)
           SELECT $3, product_id, CASE WHEN $2::integer > 0 THEN 'restock' ELSE 'removal' END,
                  $2::integer, quantity_in_stock, $4
           FROM updated
         )
         SELECT quantity_in_stock AS "quantityInStock" FROM updated`,
        [productId, adjustment, change.userId, change.reason],
      );
      if (rows[0]) return { status: "updated", quantityInStock: rows[0].quantityInStock };

      const product = await pool.query<{ quantityInStock: number }>(
        `SELECT quantity_in_stock AS "quantityInStock"
         FROM Product WHERE product_id = $1`,
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
         WHERE o.payment_status = 'paid'
         ORDER BY o.created_at DESC, o.order_id`,
      );
      return rows;
    },

    async listRobots() {
      const { rows } = await pool.query<DeliveryRobot>(
        `SELECT robot_id AS "robotId", robot_name AS "robotName", robot_status AS status,
                maximum_orders AS "maximumOrders", maximum_weight::float8 AS "maximumWeight",
                current_latitude::float8 AS "currentLatitude", current_longitude::float8 AS "currentLongitude",
                last_updated AS "lastUpdated"
         FROM Robot ORDER BY robot_name`,
      );
      return rows;
    },

    async listUnassignedPaidOrders() {
      const { rows } = await pool.query<UnassignedPaidOrder>(
        `SELECT o.order_id AS "orderId", o.user_id AS "customerId", o.address_id AS "addressId",
                o.total_weight::float8 AS "totalWeight", o.created_at AS "createdAt",
                a.street, a.city, a.state, a.zip_code AS "zipCode",
                a.latitude::float8 AS latitude, a.longitude::float8 AS longitude
         FROM Orders o JOIN Address a ON a.address_id = o.address_id
         WHERE o.payment_status = 'paid'
           AND NOT EXISTS (SELECT 1 FROM Delivery d WHERE d.order_id = o.order_id AND d.delivery_status <> 'cancelled')
         ORDER BY o.created_at, o.order_id`,
      );
      return rows;
    },

    async saveAddressCoordinates(addressId, latitude, longitude) {
      if (!UUID_PATTERN.test(addressId) || !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
          latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return false;
      const { rowCount } = await pool.query(
        "UPDATE Address SET latitude = $2, longitude = $3 WHERE address_id = $1",
        [addressId, latitude, longitude],
      );
      return rowCount !== 0;
    },

    async listRuns() {
      const { rows: runs } = await pool.query<Omit<DeliveryRun, "stops">>(
        `SELECT dr.run_id AS "runId", dr.robot_id AS "robotId", r.robot_name AS "robotName",
                dr.run_status AS status, dr.route_distance::float8 AS "routeDistanceMeters",
                dr.estimated_duration AS "estimatedDurationSeconds", dr.route_geometry AS "routeGeometry",
                dr.route_source AS "routeSource", dr.started_at AS "startedAt", dr.completed_at AS "completedAt"
         FROM DeliveryRun dr JOIN Robot r ON r.robot_id = dr.robot_id
         ORDER BY dr.started_at DESC NULLS LAST, dr.run_id DESC`,
      );
      if (runs.length === 0) return [];
      const { rows: stops } = await pool.query<DeliveryRun["stops"][number] & { runId: string }>(
        `SELECT d.run_id AS "runId", d.order_id AS "orderId", d.stop_number AS "stopNumber",
                d.delivery_status AS status, d.estimated_delivery_time AS eta,
                a.latitude::float8 AS latitude, a.longitude::float8 AS longitude
         FROM Delivery d JOIN Address a ON a.address_id = d.address_id
         WHERE d.run_id = ANY($1) ORDER BY d.run_id, d.stop_number`,
        [runs.map(({ runId }) => runId)],
      );
      return runs.map((run) => ({
        ...run,
        routeSource: run.routeSource === "valhalla" || run.routeSource === "approximate" ? run.routeSource : null,
        stops: stops.filter((stop) => stop.runId === run.runId).map(({ runId: _runId, ...stop }) => stop),
      }));
    },

    async cancelDeliveryRun(runId) {
      if (!UUID_PATTERN.test(runId)) return "not-found";
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query<{ robotId: string; status: string }>(
          `SELECT robot_id AS "robotId", run_status AS status FROM DeliveryRun WHERE run_id = $1 FOR UPDATE`,
          [runId],
        );
        const run = rows[0];
        if (!run) {
          await client.query("COMMIT");
          return "not-found";
        }
        if (!["assigned", "active"].includes(run.status)) {
          await client.query("COMMIT");
          return "not-active";
        }

        await client.query(
          `UPDATE Delivery SET delivery_status = 'cancelled', updated_at = now()
           WHERE run_id = $1 AND delivery_status <> 'delivered'`,
          [runId],
        );
        await client.query(
          `UPDATE Orders SET order_status = 'placed', updated_at = now()
           WHERE order_id IN (SELECT order_id FROM Delivery WHERE run_id = $1 AND delivery_status = 'cancelled')`,
          [runId],
        );
        await client.query(
          `UPDATE DeliveryRun SET run_status = 'cancelled', completed_at = now(), updated_at = now() WHERE run_id = $1`,
          [runId],
        );
        await client.query(`UPDATE Robot SET robot_status = 'available', last_updated = now() WHERE robot_id = $1`, [run.robotId]);
        await client.query("COMMIT");
        return "cancelled";
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async getCustomerTracking(userId, orderId) {
      if (!UUID_PATTERN.test(orderId)) return null;
      const { rows } = await pool.query<DeliveryTracking>(
        `SELECT o.order_id AS "orderId", o.order_status AS "orderStatus",
                d.delivery_status AS "deliveryStatus", d.estimated_delivery_time AS eta,
                d.stop_number AS "stopNumber", dr.run_id AS "runId", dr.route_geometry AS "routeGeometry",
                dr.route_source AS "routeSource", r.robot_name AS "robotName", r.robot_status AS "robotStatus",
                r.current_latitude::float8 AS "robotLatitude", r.current_longitude::float8 AS "robotLongitude"
         FROM Orders o
         LEFT JOIN LATERAL (
           SELECT order_id, delivery_status, estimated_delivery_time, stop_number, run_id
           FROM Delivery WHERE order_id = o.order_id
           ORDER BY created_at DESC, delivery_id DESC LIMIT 1
         ) d ON true
         LEFT JOIN DeliveryRun dr ON dr.run_id = d.run_id
         LEFT JOIN Robot r ON r.robot_id = dr.robot_id
         WHERE o.order_id = $1 AND o.user_id = $2`,
        [orderId, userId],
      );
      if (!rows[0]) return null;
      const result = rows[0];
      result.routeSource = result.routeSource === "valhalla" || result.routeSource === "approximate" ? result.routeSource : null;
      return result;
    },

    async confirmOrderReceived(userId, orderId) {
      if (!UUID_PATTERN.test(orderId)) return "not-found";
      const { rows } = await pool.query<{ orderId: string }>(
        `UPDATE Orders o SET order_status = 'completed', updated_at = now()
         WHERE o.order_id = $1 AND o.user_id = $2
           AND EXISTS (
             SELECT 1 FROM Delivery d
             WHERE d.order_id = o.order_id AND d.delivery_status = 'delivered'
           )
         RETURNING o.order_id AS "orderId"`,
        [orderId, userId],
      );
      if (rows[0]) return "completed";
      const { rows: ownedOrders } = await pool.query<{ orderId: string }>(
        "SELECT order_id AS \"orderId\" FROM Orders WHERE order_id = $1 AND user_id = $2",
        [orderId, userId],
      );
      return ownedOrders[0] ? "not-delivered" : "not-found";
    },

    async listNotifications(userId) {
      const { rows } = await pool.query<DeliveryNotification>(
        `SELECT notification_id AS "notificationId", order_id AS "orderId",
                notification_type AS type, message, is_read AS "isRead",
                created_at AS "createdAt", read_at AS "readAt"
         FROM Notification WHERE user_id = $1 ORDER BY created_at DESC, notification_id DESC`,
        [userId],
      );
      return rows;
    },

    async markNotificationRead(userId, notificationId) {
      if (!UUID_PATTERN.test(notificationId)) return false;
      const { rowCount } = await pool.query(
        `UPDATE Notification SET is_read = TRUE, read_at = COALESCE(read_at, now())
         WHERE notification_id = $1 AND user_id = $2`,
        [notificationId, userId],
      );
      return rowCount !== 0;
    },

    async createNotification(userId, orderId, type, message) {
      const { rows } = await pool.query<DeliveryNotification>(
        `INSERT INTO Notification (user_id, order_id, notification_type, message)
         VALUES ($1, $2, $3, $4)
         RETURNING notification_id AS "notificationId", order_id AS "orderId",
                   notification_type AS type, message, is_read AS "isRead",
                   created_at AS "createdAt", read_at AS "readAt"`,
        [userId, orderId, type, message],
      );
      return rows[0];
    },

    async createDeliveryRun(run) {
      if (run.stops.length < 1 || run.stops.length > MAX_DELIVERY_RUN_ORDERS) {
        throw new DeliveryAssignmentError("capacity-exceeded");
      }
      if (new Set(run.stops.map(({ orderId }) => orderId)).size !== run.stops.length) {
        throw new DeliveryAssignmentError("orders-unavailable");
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows: robots } = await client.query<{ maximumOrders: number; maximumWeight: number; status: string }>(
          `SELECT maximum_orders AS "maximumOrders", maximum_weight::float8 AS "maximumWeight", robot_status AS status
           FROM Robot WHERE robot_id = $1 FOR UPDATE`,
          [run.robotId],
        );
        const robot = robots[0];
        if (!robot || robot.status !== "available") throw new DeliveryAssignmentError("robot-unavailable");

        const orderIds = run.stops.map(({ orderId }) => orderId);
        const { rows: orders } = await client.query<{ orderId: string; addressId: string; totalWeight: number }>(
          `SELECT o.order_id AS "orderId", o.address_id AS "addressId", o.total_weight::float8 AS "totalWeight"
           FROM Orders o
           WHERE o.order_id = ANY($1) AND o.payment_status = 'paid'
             AND NOT EXISTS (SELECT 1 FROM Delivery d WHERE d.order_id = o.order_id AND d.delivery_status <> 'cancelled')
           FOR UPDATE OF o`,
          [orderIds],
        );
        if (orders.length !== orderIds.length) throw new DeliveryAssignmentError("orders-unavailable");
        const totalWeight = orders.reduce((sum, order) => sum + order.totalWeight, 0);
        if (orders.length > Math.min(robot.maximumOrders, MAX_DELIVERY_RUN_ORDERS) ||
            totalWeight > Math.min(robot.maximumWeight, MAX_DELIVERY_RUN_WEIGHT_LBS)) {
          throw new DeliveryAssignmentError("capacity-exceeded");
        }

        const { rows: [{ runId }] } = await client.query<{ runId: string }>(
          `INSERT INTO DeliveryRun
             (robot_id, run_status, route_distance, estimated_duration, route_geometry, route_source, started_at)
           VALUES ($1, 'assigned', $2, $3, $4::jsonb, $5, NULL)
           RETURNING run_id AS "runId"`,
          [run.robotId, run.routeDistanceMeters, run.estimatedDurationSeconds, JSON.stringify(run.routeGeometry), run.routeSource],
        );

        for (let index = 0; index < run.stops.length; index += 1) {
          const stop = run.stops[index];
          const order = orders.find(({ orderId }) => orderId === stop.orderId)!;
          await client.query(
            `INSERT INTO Delivery (order_id, address_id, run_id, delivery_status, stop_number, estimated_delivery_time)
             VALUES ($1, $2, $3, 'scheduled', $4, $5)`,
            [stop.orderId, order.addressId, runId, index + 1, stop.estimatedDeliveryTime],
          );
        }

        await client.query("UPDATE Orders SET order_status = 'out_for_delivery', updated_at = now() WHERE order_id = ANY($1)", [orderIds]);
        await client.query("UPDATE Robot SET robot_status = 'on_delivery', last_updated = now() WHERE robot_id = $1", [run.robotId]);
        await client.query("COMMIT");
        return runId;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async updateRobotPosition(robotId, latitude, longitude) {
      if (!UUID_PATTERN.test(robotId) || !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
          latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return false;
      const { rowCount } = await pool.query(
        `UPDATE Robot SET current_latitude = $2, current_longitude = $3, last_updated = now()
         WHERE robot_id = $1`,
        [robotId, latitude, longitude],
      );
      return rowCount !== 0;
    },

    async listSimulatableRuns() {
      const { rows: runs } = await pool.query<Omit<SimulatableDeliveryRun, "stops">>(
        `SELECT run_id AS "runId", robot_id AS "robotId", created_at AS "createdAt",
                estimated_duration AS "estimatedDurationSeconds", route_geometry AS "routeGeometry"
         FROM DeliveryRun WHERE run_status IN ('assigned', 'active')
         ORDER BY created_at, run_id`,
      );
      if (runs.length === 0) return [];
      const { rows: stops } = await pool.query<SimulatableDeliveryRun["stops"][number] & { runId: string }>(
        `SELECT run_id AS "runId", order_id AS "orderId", stop_number AS "stopNumber",
                estimated_delivery_time AS eta, delivery_status AS status
         FROM Delivery
         WHERE run_id = ANY($1) AND delivery_status <> 'delivered'
         ORDER BY run_id, stop_number`,
        [runs.map(({ runId }) => runId)],
      );
      return runs.map((run) => ({
        ...run,
        routeGeometry: Array.isArray(run.routeGeometry) ? run.routeGeometry : [],
        stops: stops.filter((stop) => stop.runId === run.runId).map(({ runId: _runId, ...stop }) => stop),
      }));
    },

    async recordSimulationTick(tick) {
      if (!UUID_PATTERN.test(tick.runId) || !Number.isFinite(tick.latitude) || !Number.isFinite(tick.longitude) ||
          tick.latitude < -90 || tick.latitude > 90 || tick.longitude < -180 || tick.longitude > 180) return;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows: runs } = await client.query<{ robotId: string; status: string }>(
          `SELECT robot_id AS "robotId", run_status AS status
           FROM DeliveryRun WHERE run_id = $1 FOR UPDATE`,
          [tick.runId],
        );
        const run = runs[0];
        if (!run || !["assigned", "active"].includes(run.status)) {
          await client.query("COMMIT");
          return;
        }

        await client.query(
          `UPDATE DeliveryRun SET run_status = 'active', started_at = COALESCE(started_at, $2), updated_at = $2
           WHERE run_id = $1`,
          [tick.runId, tick.occurredAt],
        );
        await client.query(
          `UPDATE Robot SET current_latitude = $2, current_longitude = $3, last_updated = $4, robot_status = 'on_delivery'
           WHERE robot_id = $1`,
          [run.robotId, tick.latitude, tick.longitude, tick.occurredAt],
        );

        if (tick.arrivedStopNumbers.length > 0) {
          const { rows: arrived } = await client.query<{ orderId: string; userId: string }>(
            `UPDATE Delivery d
             SET delivery_status = 'delivered', arrival_time = COALESCE(d.arrival_time, $3),
                 actual_delivery_time = COALESCE(d.actual_delivery_time, $3), updated_at = $3
             FROM Orders o
             WHERE d.order_id = o.order_id AND d.run_id = $1
               AND d.stop_number = ANY($2) AND d.delivery_status <> 'delivered'
             RETURNING d.order_id AS "orderId", o.user_id AS "userId"`,
            [tick.runId, tick.arrivedStopNumbers, tick.occurredAt],
          );
          for (const delivery of arrived) {
            await client.query(
              `INSERT INTO Notification (user_id, order_id, notification_type, message)
               VALUES ($1, $2, 'delivery_arrived', $3)`,
              [delivery.userId, delivery.orderId, `Your delivery for order #${delivery.orderId.slice(0, 8).toUpperCase()} has arrived. Please confirm you received it.`],
            );
          }
        }

        await client.query(
          `UPDATE Delivery SET delivery_status = 'in_transit', updated_at = $2
           WHERE run_id = $1 AND delivery_status = 'scheduled'
             AND stop_number = (
               SELECT MIN(stop_number) FROM Delivery WHERE run_id = $1 AND delivery_status = 'scheduled'
             )`,
          [tick.runId, tick.occurredAt],
        );

        if (tick.completed) {
          await client.query(
            `UPDATE DeliveryRun SET run_status = 'completed', completed_at = $2, updated_at = $2 WHERE run_id = $1`,
            [tick.runId, tick.occurredAt],
          );
          await client.query(
            `UPDATE Robot SET robot_status = 'available', last_updated = $2 WHERE robot_id = $1`,
            [run.robotId, tick.occurredAt],
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
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
  // False once a manager deactivates the product; checkout refuses it until it's removed.
  active: boolean;
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
                p.quantity_in_stock AS "quantityInStock", ci.quantity, p.active
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
