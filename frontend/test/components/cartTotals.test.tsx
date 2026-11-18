// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { CartLine } from "../../src/cart/api";
import { CartPage } from "../../src/cart/CartPage";
import { catalog, fakeServer, renderPage, shopper } from "./helpers";

// A cart that behaves like the real API: it changes on add/update/remove and checks stock.
function cartServer(start: { productId: string; quantity: number }[], settings = { deliveryFee: 10, freeDeliveryWeightThreshold: 20, deliveryRadiusMiles: 50 }) {
  let cart = [...start];
  const lines = (): CartLine[] => cart.map(({ productId, quantity }) => {
    const product = catalog.find((p) => p.id === productId)!;
    return { cartItemId: `c-${productId}`, productId, name: product.name, category: product.category, unit: product.unit, price: product.price, weightLbs: product.weightLbs, quantityInStock: product.quantityInStock, quantity, active: true };
  });
  const routes: Parameters<typeof fakeServer>[0] = {
    "GET /api/auth/me": () => ({ body: { user: shopper } }),
    "GET /api/notifications": () => ({ body: { notifications: [] } }),
    "GET /api/settings": () => ({ body: settings }),
    "GET /api/cart": () => ({ body: { items: lines() } }),
  };
  for (const product of catalog) {
    routes[`PATCH /api/cart/items/${product.id}`] = ({ body }) => {
      const quantity = (body as { quantity: number }).quantity;
      if (quantity > product.quantityInStock) return { status: 409, body: { error: `Only ${product.quantityInStock} left in stock.` } };
      cart = cart.map((line) => (line.productId === product.id ? { ...line, quantity } : line));
      return { body: { items: lines() } };
    };
    routes[`DELETE /api/cart/items/${product.id}`] = () => {
      cart = cart.filter((line) => line.productId !== product.id);
      return { body: { items: lines() } };
    };
  }
  return fakeServer(routes);
}

const summary = () => within(screen.getByRole("region", { name: "Order summary" }));
const value = (label: string) => summary().getByText(label).nextElementSibling?.textContent;

// Part 2, client layer: "Update Checkout Price", and application layer cart cases.
describe("cart totals", () => {
  it("adds up price and weight for every line", async () => {
    cartServer([{ productId: "p1", quantity: 2 }, { productId: "p2", quantity: 1 }]);
    renderPage(<CartPage />, "/cart");
    await screen.findByText("Gala Apples");

    expect(value("Total price")).toBe("$8.97");
    expect(value("Total weight")).toBe("4.0 lb");
    expect(value("Delivery fee")).toBe("Free");
    expect(screen.getByRole("meter", { name: /Cart weight/ })).toHaveAttribute("aria-valuenow", "4");
  });

  it("recalculates when a quantity goes up or down", async () => {
    cartServer([{ productId: "p1", quantity: 2 }]);
    const user = userEvent.setup();
    renderPage(<CartPage />, "/cart");
    await screen.findByText("Gala Apples");

    await user.click(screen.getByRole("button", { name: "Increase Gala Apples quantity" }));
    expect(await screen.findByLabelText("Quantity 3")).toBeInTheDocument();
    expect(value("Total price")).toBe("$4.47");

    await user.click(screen.getByRole("button", { name: "Decrease Gala Apples quantity" }));
    expect(await screen.findByLabelText("Quantity 2")).toBeInTheDocument();
    expect(value("Total price")).toBe("$2.98");
  });

  it("adds the delivery fee once the cart reaches the weight limit", async () => {
    cartServer([{ productId: "p1", quantity: 19 }]);
    const user = userEvent.setup();
    renderPage(<CartPage />, "/cart");
    await screen.findByText("Gala Apples");
    expect(value("Delivery fee")).toBe("Free");
    expect(screen.getByText(/1\.0 lb left before the \$10\.00 delivery fee/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Increase Gala Apples quantity" }));

    expect(await screen.findByLabelText("Quantity 20")).toBeInTheDocument();
    expect(value("Delivery fee")).toBe("$10.00");
    expect(screen.getByText("Orders of 20 lb or more pay a $10.00 delivery fee.")).toBeInTheDocument();
  });

  it("uses the manager's delivery settings", async () => {
    cartServer([{ productId: "p1", quantity: 6 }], { deliveryFee: 4.5, freeDeliveryWeightThreshold: 5, deliveryRadiusMiles: 50 });
    renderPage(<CartPage />, "/cart");
    await screen.findByText("Gala Apples");

    expect(await screen.findByText("Orders of 5 lb or more pay a $4.50 delivery fee.")).toBeInTheDocument();
    expect(value("Delivery fee")).toBe("$4.50");
  });

  it("removes an item and drops it from the totals", async () => {
    cartServer([{ productId: "p1", quantity: 2 }, { productId: "p2", quantity: 1 }]);
    const user = userEvent.setup();
    renderPage(<CartPage />, "/cart");
    await screen.findByText("Jasmine Rice");

    const rice = screen.getByRole("heading", { name: "Jasmine Rice" }).closest("article")!;
    await user.click(within(rice).getByRole("button", { name: "Remove" }));

    expect(screen.queryByText("Jasmine Rice")).not.toBeInTheDocument();
    expect(value("Total price")).toBe("$2.98");
    expect(value("Total weight")).toBe("2.0 lb");
  });

  it("removes the last unit with the minus button, leaving an empty cart", async () => {
    cartServer([{ productId: "p1", quantity: 1 }]);
    const user = userEvent.setup();
    renderPage(<CartPage />, "/cart");
    await screen.findByText("Gala Apples");

    await user.click(screen.getByRole("button", { name: "Decrease Gala Apples quantity" }));

    expect(await screen.findByText("Your cart is empty")).toBeInTheDocument();
  });

  it("won't go above the stock on hand", async () => {
    cartServer([{ productId: "p2", quantity: 3 }]);
    renderPage(<CartPage />, "/cart");
    await screen.findByText("Jasmine Rice");

    expect(screen.getByRole("button", { name: "Increase Jasmine Rice quantity" })).toBeDisabled();
    expect(screen.getByText("That's all we have (3 left).")).toBeInTheDocument();
  });

  it("goes to checkout from the summary", async () => {
    cartServer([{ productId: "p1", quantity: 1 }]);
    const user = userEvent.setup();
    renderPage(<CartPage />, "/cart");
    await screen.findByText("Gala Apples");

    await user.click(screen.getByRole("button", { name: "Checkout" }));
    expect(screen.getByTestId("current-path")).toHaveTextContent("/checkout");
  });
});
