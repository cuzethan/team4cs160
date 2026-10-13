import { randomUUID } from "node:crypto";
import {
  EmailTakenError,
  type AuthStore,
  type CartLine,
  type CartProduct,
  type CartStore,
  type CustomerRecord,
  type User,
} from "../src/store.js";

// In-memory stand-ins for the Postgres stores, so tests run without a database.
export function createMemoryStore() {
  const users = new Map<string, User>();
  const sessions = new Map<string, { userId: string; expiresAt: Date }>();
  const resets = new Map<string, { userId: string; expiresAt: Date; used: boolean }>();

  const store: AuthStore = {
    async findUserByEmail(email) {
      return [...users.values()].find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
    },
    async listCustomers() {
      return [...users.values()]
        .filter((user) => user.role === "customer")
        .map((user): CustomerRecord => ({
          id: user.userId,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          accountStatus: user.accountStatus,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        }));
    },
    async createUser(user) {
      if (await store.findUserByEmail(user.email)) throw new EmailTakenError();
      const created: User = { ...user, userId: randomUUID(), accountStatus: "active" };
      users.set(created.userId, created);
      return created;
    },
    async updatePassword(userId, passwordHash) {
      users.get(userId)!.passwordHash = passwordHash;
    },
    async createSession(userId, tokenHash, expiresAt) {
      sessions.set(tokenHash, { userId, expiresAt });
    },
    async findSessionUser(tokenHash) {
      const session = sessions.get(tokenHash);
      if (!session || session.expiresAt <= new Date()) return null;
      return users.get(session.userId) ?? null;
    },
    async deleteSession(tokenHash) {
      sessions.delete(tokenHash);
    },
    async deleteUserSessions(userId) {
      for (const [hash, session] of sessions) if (session.userId === userId) sessions.delete(hash);
    },
    async createResetToken(userId, tokenHash, expiresAt) {
      resets.set(tokenHash, { userId, expiresAt, used: false });
    },
    async consumeResetToken(tokenHash) {
      const reset = resets.get(tokenHash);
      if (!reset || reset.used || reset.expiresAt <= new Date()) return null;
      reset.used = true;
      return reset.userId;
    },
  };

  return { store, users };
}

export function createMemoryCartStore(products: CartProduct[]) {
  const productsById = new Map(products.map((product) => [product.productId, { ...product }]));
  // userId -> productId -> line
  const carts = new Map<string, Map<string, { cartItemId: string; quantity: number }>>();

  const cartStore: CartStore = {
    async findProduct(productId) {
      return productsById.get(productId) ?? null;
    },
    async listCartItems(userId) {
      return [...(carts.get(userId) ?? new Map()).entries()]
        .map(([productId, line]): CartLine => {
          const product = productsById.get(productId)!;
          return {
            cartItemId: line.cartItemId,
            productId,
            name: product.name,
            price: product.price,
            weightLbs: product.weightLbs,
            quantityInStock: product.quantityInStock,
            quantity: line.quantity,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async setCartItemQuantity(userId, productId, quantity) {
      const cart = carts.get(userId) ?? new Map();
      carts.set(userId, cart);
      const existing = cart.get(productId);
      cart.set(productId, { cartItemId: existing?.cartItemId ?? randomUUID(), quantity });
    },
    async removeCartItem(userId, productId) {
      carts.get(userId)?.delete(productId);
    },
  };

  return { cartStore, products: productsById };
}
