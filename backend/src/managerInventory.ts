import express from "express";
import { findCurrentUser, handle } from "./auth.js";
import type { AuthStore, ProductChanges, ProductStore } from "./store.js";

export type ManagerInventoryOptions = {
  store: AuthStore;
  productStore: ProductStore;
};

const MAX_STOCK = 2147483647;

// Checks the product fields present in `body`. With `requireAll`, every field must be
// present (creating a product); otherwise only the fields sent are checked (editing).
export function parseProductFields(
  body: Record<string, unknown>,
  categoryIds: string[],
  requireAll: boolean,
): { changes: ProductChanges } | { error: string } {
  const changes: ProductChanges = {};
  const has = (field: string) => requireAll || body[field] !== undefined;

  if (has("name")) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 100) return { error: "Enter a product name (up to 100 characters)." };
    changes.name = name;
  }
  // The description is optional, even when creating a product.
  if (body.description !== undefined) {
    if (typeof body.description !== "string" || body.description.trim().length > 1000) {
      return { error: "The description can be up to 1000 characters." };
    }
    changes.description = body.description.trim();
  } else if (requireAll) {
    changes.description = "";
  }
  if (has("price")) {
    const price = body.price;
    if (typeof price !== "number" || !Number.isFinite(price) || price < 0 || price > 99999.99) {
      return { error: "Enter a price from $0 to $99,999.99." };
    }
    changes.price = Math.round(price * 100) / 100;
  }
  if (has("weightLbs")) {
    const weight = typeof body.weightLbs === "number" ? Math.round(body.weightLbs * 100) / 100 : NaN;
    if (!Number.isFinite(weight) || weight <= 0 || weight > 1000) {
      return { error: "Enter a weight from 0.01 to 1000 lb." };
    }
    changes.weightLbs = weight;
  }
  if (has("unit")) {
    const unit = typeof body.unit === "string" ? body.unit.trim() : "";
    if (!unit || unit.length > 20) return { error: "Enter a unit, like lb, each, or bag (up to 20 characters)." };
    changes.unit = unit;
  }
  if (has("categoryId")) {
    if (typeof body.categoryId !== "string" || !categoryIds.includes(body.categoryId)) {
      return { error: "Choose a category." };
    }
    changes.categoryId = body.categoryId;
  }
  if (!requireAll && body.active !== undefined) {
    if (typeof body.active !== "boolean") return { error: "Active must be true or false." };
    changes.active = body.active;
  }
  return { changes };
}

export function createManagerInventoryRouter({ store, productStore }: ManagerInventoryOptions) {
  const router = express.Router();

  const requireManager = async (req: express.Request, res: express.Response) => {
    const user = await findCurrentUser(store, req);
    if (!user) {
      res.status(401).json({ error: "Not logged in." });
      return null;
    }
    if (user.role !== "admin") {
      res.status(403).json({ error: "Manager access is required." });
      return null;
    }
    return user;
  };

  // Every product (including deactivated ones) and the categories to choose from.
  router.get("/", handle(async (req, res) => {
    if (!(await requireManager(req, res))) return;
    const [products, categories] = await Promise.all([
      productStore.listManagedProducts(),
      productStore.listCategories(),
    ]);
    res.json({ products, categories });
  }));

  router.post("/", handle(async (req, res) => {
    const user = await requireManager(req, res);
    if (!user) return;

    const categories = await productStore.listCategories();
    const parsed = parseProductFields(req.body ?? {}, categories.map((category) => category.id), true);
    if ("error" in parsed) return res.status(400).json({ error: parsed.error });

    const quantity = req.body?.quantityInStock ?? 0;
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > MAX_STOCK) {
      return res.status(400).json({ error: "Enter a starting stock of 0 or more." });
    }

    const { changes } = parsed;
    const product = await productStore.createProduct(user.userId, {
      name: changes.name!,
      description: changes.description ?? "",
      price: changes.price!,
      weightLbs: changes.weightLbs!,
      unit: changes.unit!,
      categoryId: changes.categoryId!,
      quantityInStock: quantity,
    });
    res.status(201).json({ product });
  }));

  router.patch("/:productId", handle(async (req, res) => {
    const user = await requireManager(req, res);
    if (!user) return;

    const categories = await productStore.listCategories();
    const parsed = parseProductFields(req.body ?? {}, categories.map((category) => category.id), false);
    if ("error" in parsed) return res.status(400).json({ error: parsed.error });
    if (Object.keys(parsed.changes).length === 0) {
      return res.status(400).json({ error: "Nothing to update." });
    }

    const product = await productStore.updateProduct(user.userId, req.params.productId, parsed.changes);
    if (!product) return res.status(404).json({ error: "Product not found." });
    res.json({ product });
  }));

  router.patch("/:productId/stock", handle(async (req, res) => {
    const user = await requireManager(req, res);
    if (!user) return;

    const adjustment = req.body?.adjustment;
    if (
      !Number.isSafeInteger(adjustment) ||
      adjustment === 0 ||
      Math.abs(adjustment) > MAX_STOCK
    ) {
      return res.status(400).json({ error: "Enter a valid stock adjustment." });
    }

    const reasonInput = req.body?.reason;
    if (reasonInput !== undefined && (typeof reasonInput !== "string" || reasonInput.trim().length > 200)) {
      return res.status(400).json({ error: "The reason can be up to 200 characters." });
    }
    const reason = (reasonInput as string | undefined)?.trim() || "Manual adjustment";

    const result = await productStore.adjustStock(req.params.productId, adjustment, { userId: user.userId, reason });
    if (result.status === "not-found") {
      return res.status(404).json({ error: "Product not found." });
    }
    if (result.status === "insufficient-stock") {
      return res.status(409).json({ error: "Stock quantity cannot be less than zero." });
    }
    if (result.status === "maximum-stock") {
      return res.status(409).json({ error: "Stock quantity is at its maximum." });
    }

    res.json({ quantityInStock: result.quantityInStock });
  }));

  return router;
}
