import express, { type Request, type Response } from "express";
import { findCurrentUser, handle } from "./auth.js";
import type { AuthStore, CartStore, User } from "./store.js";

export type CartOptions = {
  store: AuthStore;
  cartStore: CartStore;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function quantityValue(value: unknown) {
  return Number.isInteger(value) && (value as number) > 0 ? (value as number) : null;
}

export function createCartRouter({ store, cartStore }: CartOptions) {
  const router = express.Router();

  // Sends the right error and returns null unless a customer is logged in.
  async function requireCustomer(req: Request, res: Response): Promise<User | null> {
    const user = await findCurrentUser(store, req);
    if (!user) {
      res.status(401).json({ error: "Please log in to use your cart." });
      return null;
    }
    if (user.role !== "customer") {
      res.status(403).json({ error: "Only customer accounts have a cart." });
      return null;
    }
    return user;
  }

  // Checks the product can be bought in this quantity. Sends the error and returns false if not.
  async function checkStock(res: Response, productId: string, quantity: number) {
    const product = UUID_PATTERN.test(productId) ? await cartStore.findProduct(productId) : null;
    if (!product || !product.active) {
      res.status(404).json({ error: "That product isn't available." });
      return false;
    }
    if (quantity > product.quantityInStock) {
      res.status(409).json({
        error: `Only ${product.quantityInStock} of ${product.name} ${product.quantityInStock === 1 ? "is" : "are"} in stock.`,
      });
      return false;
    }
    return true;
  }

  async function sendCart(res: Response, user: User) {
    res.json({ items: await cartStore.listCartItems(user.userId) });
  }

  router.get("/", handle(async (req, res) => {
    const user = await requireCustomer(req, res);
    if (user) await sendCart(res, user);
  }));

  // Adds to whatever quantity is already in the cart.
  router.post("/items", handle(async (req, res) => {
    const user = await requireCustomer(req, res);
    if (!user) return;

    const productId = typeof req.body?.productId === "string" ? req.body.productId : "";
    const quantity = req.body?.quantity === undefined ? 1 : quantityValue(req.body.quantity);
    if (!quantity) return res.status(400).json({ error: "Quantity must be a whole number above zero." });

    const items = await cartStore.listCartItems(user.userId);
    const current = items.find((item) => item.productId === productId)?.quantity ?? 0;
    if (!(await checkStock(res, productId, current + quantity))) return;

    await cartStore.setCartItemQuantity(user.userId, productId, current + quantity);
    await sendCart(res, user);
  }));

  router.patch("/items/:productId", handle(async (req, res) => {
    const user = await requireCustomer(req, res);
    if (!user) return;

    const { productId } = req.params;
    const quantity = quantityValue(req.body?.quantity);
    if (!quantity) return res.status(400).json({ error: "Quantity must be a whole number above zero." });

    const items = await cartStore.listCartItems(user.userId);
    if (!items.some((item) => item.productId === productId)) {
      return res.status(404).json({ error: "That item isn't in your cart." });
    }
    if (!(await checkStock(res, productId, quantity))) return;

    await cartStore.setCartItemQuantity(user.userId, productId, quantity);
    await sendCart(res, user);
  }));

  router.delete("/items/:productId", handle(async (req, res) => {
    const user = await requireCustomer(req, res);
    if (!user) return;

    if (UUID_PATTERN.test(req.params.productId)) {
      await cartStore.removeCartItem(user.userId, req.params.productId);
    }
    await sendCart(res, user);
  }));

  return router;
}
