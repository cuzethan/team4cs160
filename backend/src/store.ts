import type pg from "pg";

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

export type CartProduct = {
  productId: string;
  name: string;
  price: number;
  weightLbs: number;
  quantityInStock: number;
  active: boolean;
};

export type CartLine = {
  cartItemId: string;
  productId: string;
  name: string;
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
        `SELECT product_id AS "productId", product_name AS name, price::float8 AS price,
                weight::float8 AS "weightLbs", quantity_in_stock AS "quantityInStock", active
         FROM Product WHERE product_id = $1`,
        [productId],
      );
      return rows[0] ?? null;
    },

    async listCartItems(userId) {
      const { rows } = await pool.query<CartLine>(
        `SELECT ci.cart_item_id AS "cartItemId", p.product_id AS "productId", p.product_name AS name,
                p.price::float8 AS price, p.weight::float8 AS "weightLbs",
                p.quantity_in_stock AS "quantityInStock", ci.quantity
         FROM ShoppingCart sc
         JOIN CartItems ci ON ci.cart_id = sc.cart_id
         JOIN Product p ON p.product_id = ci.product_id
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
