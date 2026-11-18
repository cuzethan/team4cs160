import express from "express";
import { findCurrentUser, handle } from "./auth.js";
import type { AuthStore, OrderStore } from "./store.js";

export type ManagerOrdersOptions = {
  store: AuthStore;
  orderStore: OrderStore;
};

// Every order with who placed it, for the manager's Orders page. The page filters by
// status and searches on its own, so this returns the newest orders in one go.
export function createManagerOrdersRouter({ store, orderStore }: ManagerOrdersOptions) {
  const router = express.Router();

  router.get("/", handle(async (req, res) => {
    const user = await findCurrentUser(store, req);
    if (!user) return res.status(401).json({ error: "Not logged in." });
    if (user.role !== "admin") return res.status(403).json({ error: "Manager access is required." });
    if (!orderStore.listAllOrders) return res.status(501).json({ error: "The order list is not available." });

    const [orders, customers] = await Promise.all([orderStore.listAllOrders(), store.listCustomers()]);
    const customersById = new Map(customers.map((customer) => [customer.id, customer]));
    res.json({
      orders: orders.map(({ userId, ...order }) => {
        const customer = customersById.get(userId);
        return {
          ...order,
          customerId: userId,
          customerName: customer ? `${customer.firstName} ${customer.lastName}`.trim() : "Unknown customer",
          customerEmail: customer?.email ?? null,
        };
      }),
    });
  }));

  return router;
}
