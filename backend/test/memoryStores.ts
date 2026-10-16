import { randomUUID } from "node:crypto";
import {
  EmailTakenError,
  type AuthStore,
  type CartLine,
  type CartProduct,
  type CartStore,
  type CustomerRecord,
  type ManagedProduct,
  CheckoutError,
  quoteFromLines,
  type OrderRecord,
  type OrderStore,
  type ProductStore,
  type SavedAddress,
  type User,
  DEFAULT_DELIVERY_SETTINGS,
  type SettingsStore,
} from "../src/store.js";

export function createMemorySettingsStore() {
  let settings = { ...DEFAULT_DELIVERY_SETTINGS };
  const settingsStore: SettingsStore = {
    async get() { return { ...settings }; },
    async update(next) { settings = { ...next }; return { ...settings }; },
  };
  return { settingsStore };
}
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
            category: product.category,
            unit: product.unit,
            price: product.price,
            weightLbs: product.weightLbs,
            quantityInStock: product.quantityInStock,
            quantity: line.quantity,
            active: product.active,
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

  return { cartStore, products: productsById, carts };
}

export function createMemoryOrderStore({ cartStore, products, carts }: ReturnType<typeof createMemoryCartStore>, settingsStore?: SettingsStore) {
  const orders: (OrderRecord & { userId: string; address: SavedAddress })[] = [];

  async function pricedLines(userId: string) {
    const lines = await cartStore.listCartItems(userId);
    return lines.map((line) => {
      const product = products.get(line.productId)!;
      return {
        name: line.name,
        price: line.price,
        weight: line.weightLbs,
        stock: product.quantityInStock,
        active: product.active,
        quantity: line.quantity,
      };
    });
  }

  const orderStore: OrderStore = {
    async getLatestAddress(userId) {
      const latestOrder = [...orders].reverse().find((order) => order.userId === userId);
      return latestOrder ? { ...latestOrder.address } : null;
    },
    async quoteOrder(userId) {
      return quoteFromLines(await pricedLines(userId), await settingsStore?.get() ?? DEFAULT_DELIVERY_SETTINGS);
    },
    async placeOrder(userId, address, payment) {
      const lines = await cartStore.listCartItems(userId);
      const { subtotal, deliveryFee, grandTotal, totalWeight } = quoteFromLines(await pricedLines(userId), await settingsStore?.get() ?? DEFAULT_DELIVERY_SETTINGS);
      if (Math.round(grandTotal * 100) !== payment.amountCents) {
        throw new CheckoutError("Your cart total changed. Refresh checkout and pay again.");
      }
      const order = {
        userId,
        address: { ...address },
        orderId: randomUUID(),
        createdAt: new Date(),
        orderStatus: "placed",
        paymentStatus: "paid",
        subtotal,
        deliveryFee,
        grandTotal,
        totalWeight,
        items: lines.map((line) => ({
          orderItemId: randomUUID(),
          productId: line.productId,
          productName: line.name,
          quantity: line.quantity,
          priceAtPurchase: line.price,
          weightAtPurchase: line.weightLbs,
        })),
      };
      for (const line of lines) products.get(line.productId)!.quantityInStock -= line.quantity;
      carts.delete(userId);
      orders.push(order);
      const { userId: _userId, ...record } = order;
      return record;
    },
    async listOrders(userId) {
      return orders
        .filter((order) => order.userId === userId)
        .reverse()
        .map(({ userId: _userId, address: _address, ...record }) => record);
    },
  };

  return { orderStore };
}

// Categories are keyed "cat-<name>". Stock changes and price changes are kept in
// `transactions` and `priceHistory` so tests can check what was logged.
export function createMemoryProductStore({ products }: ReturnType<typeof createMemoryCartStore>) {
  const descriptions = new Map<string, string>();
  const categories = new Map<string, string>(
    [...products.values()].map((product) => [`cat-${product.category}`, product.category]),
  );
  const transactions: { userId: string; productId: string; quantityChanged: number; quantityAfterChange: number; reason: string }[] = [];
  const priceHistory: { productId: string; changedBy: string; oldPrice: number; newPrice: number }[] = [];

  const managed = (product: CartProduct): ManagedProduct => {
    const { productId, ...rest } = product;
    return {
      ...rest,
      id: productId,
      description: descriptions.get(productId) ?? "",
      imageUrl: null,
      categoryId: `cat-${product.category}`,
    };
  };
  const byCategoryThenName = (a: ManagedProduct, b: ManagedProduct) =>
    a.category.localeCompare(b.category) || a.name.localeCompare(b.name);

  const productStore: ProductStore = {
    async listProducts() {
      return [...products.values()]
        .filter((product) => product.active)
        .map((product) => {
          const { categoryId: _categoryId, active: _active, ...catalog } = managed(product);
          return catalog;
        })
        .sort(byCategoryThenName);
    },
    async listManagedProducts() {
      return [...products.values()].map(managed).sort((a, b) => Number(b.active) - Number(a.active) || byCategoryThenName(a, b));
    },
    async listCategories() {
      return [...categories].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    },
    async createProduct(userId, input) {
      const productId = randomUUID();
      products.set(productId, {
        productId,
        name: input.name,
        category: categories.get(input.categoryId)!,
        unit: input.unit,
        price: input.price,
        weightLbs: input.weightLbs,
        quantityInStock: input.quantityInStock,
        active: true,
      });
      descriptions.set(productId, input.description);
      if (input.quantityInStock > 0) {
        transactions.push({ userId, productId, quantityChanged: input.quantityInStock, quantityAfterChange: input.quantityInStock, reason: "Initial stock" });
      }
      return managed(products.get(productId)!);
    },
    async updateProduct(userId, productId, changes) {
      const product = products.get(productId);
      if (!product) return null;
      if (changes.price !== undefined && changes.price !== product.price) {
        priceHistory.push({ productId, changedBy: userId, oldPrice: product.price, newPrice: changes.price });
      }
      const { categoryId, description, ...rest } = changes;
      Object.assign(product, rest);
      if (categoryId !== undefined) product.category = categories.get(categoryId)!;
      if (description !== undefined) descriptions.set(productId, description);
      return managed(product);
    },
    async adjustStock(productId, adjustment, change) {
      const product = products.get(productId);
      if (!product) return { status: "not-found" };
      const nextQuantity = product.quantityInStock + adjustment;
      if (nextQuantity < 0) return { status: "insufficient-stock" };
      if (nextQuantity > 2147483647) return { status: "maximum-stock" };
      product.quantityInStock = nextQuantity;
      transactions.push({ userId: change.userId, productId, quantityChanged: adjustment, quantityAfterChange: nextQuantity, reason: change.reason });
      return { status: "updated", quantityInStock: nextQuantity };
    },
  };

  return { productStore, transactions, priceHistory };
}
