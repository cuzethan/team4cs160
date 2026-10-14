import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { createAuthRouter, type AuthOptions } from "./auth.js";
import { createCartRouter } from "./cart.js";
import { createOrderRouter } from "./orders.js";
import { createProductRouter } from "./products.js";
import { PaymentsNotConfiguredError, type PaymentIntentCreator } from "./payments.js";
import type { CartStore, OrderStore, ProductStore } from "./store.js";

export type AppOptions = AuthOptions & {
  cartStore: CartStore;
  orderStore: OrderStore;
  productStore: ProductStore;
  payments?: PaymentIntentCreator;
  checkDatabase: () => Promise<void>;
};

export function createApp({ checkDatabase, cartStore, orderStore, productStore, payments, ...authOptions }: AppOptions) {
  const app = express();

  app.use(cors({ origin: authOptions.appUrl, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.get("/health", async (_req, res) => {
    try {
      await checkDatabase();
      res.json({ status: "ok", database: "connected" });
    } catch {
      res.status(503).json({ status: "degraded", database: "unavailable" });
    }
  });

  app.use("/api/auth", createAuthRouter(authOptions));
  app.use("/api/products", createProductRouter(productStore));
  app.use("/api/cart", createCartRouter({ store: authOptions.store, cartStore }));
  const paymentIntents = payments ?? {
    async create() {
      throw new PaymentsNotConfiguredError("STRIPE_SECRET_KEY is not set.");
    },
    async retrieveSucceeded() {
      throw new PaymentsNotConfiguredError("STRIPE_SECRET_KEY is not set.");
    },
  };
  app.use("/api/orders", createOrderRouter({ store: authOptions.store, orderStore, payments: paymentIntents }));

  return app;
}
