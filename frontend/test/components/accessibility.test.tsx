// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it } from "vitest";
import { CartPage } from "../../src/cart/CartPage";
import { InventoryPage } from "../../src/inventory/InventoryPage";
import { DedicatedLogin } from "../../src/login/Login";
import { catalog, fakeServer, manager, renderPage, shopper } from "./helpers";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Part 2, client layer: "Accessibility".

// --- Color contrast (WCAG AA: 4.5:1 for normal text) ---
const theme = Object.fromEntries(
  [...readFileSync(resolve(process.cwd(), "src/index.css"), "utf8").matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})/gi)]
    .map(([, name, value]) => [name, value]),
);

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe("color contrast", () => {
  // Text colors and the backgrounds the app puts them on.
  const pairs: [text: string, background: string][] = [
    ["ink", "canvas"], ["ink", "surface"], ["ink", "accent-soft"],
    ["muted", "canvas"], ["muted", "surface"], ["muted", "accent-soft"],
    ["accent-ink", "canvas"], ["accent-ink", "surface"], ["accent-ink", "accent-soft"],
    ["on-accent", "accent"], ["on-accent", "accent-hover"],
    ["warning", "surface"], ["warning", "warning-soft"], ["warning", "canvas"],
  ];

  it.each(pairs)("%s text on %s meets 4.5:1", (text, background) => {
    expect(theme[text], text).toBeDefined();
    expect(theme[background], background).toBeDefined();
    expect(contrast(theme[text], theme[background])).toBeGreaterThanOrEqual(4.5);
  });
});

// --- Automated checks (labels, roles, names, landmarks) ---
async function axeViolations() {
  // axe probes icon fonts with a canvas, which jsdom lacks; skip that probe quietly.
  HTMLCanvasElement.prototype.getContext = () => null;
  // jsdom can't measure rendered colors; contrast is covered by the token check above.
  const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

function shopServer() {
  return fakeServer({
    "GET /api/auth/me": () => ({ body: { user: shopper } }),
    "GET /api/products": () => ({ body: { products: catalog } }),
    "GET /api/notifications": () => ({ body: { notifications: [] } }),
    "GET /api/settings": () => ({ body: { deliveryFee: 10, freeDeliveryWeightThreshold: 20, deliveryRadiusMiles: 50 } }),
    "GET /api/cart": () => ({
      body: { items: [{ cartItemId: "c1", productId: "p1", name: "Gala Apples", category: "Fruits", unit: "lb", price: 1.49, weightLbs: 1, quantityInStock: 34, quantity: 2, active: true }] },
    }),
    "PATCH /api/cart/items/p1": ({ body }) => ({
      body: { items: [{ cartItemId: "c1", productId: "p1", name: "Gala Apples", category: "Fruits", unit: "lb", price: 1.49, weightLbs: 1, quantityInStock: 34, quantity: (body as { quantity: number }).quantity, active: true }] },
    }),
  });
}

describe("automated accessibility scan", () => {
  it("finds no problems on the login page", async () => {
    fakeServer({ "GET /api/auth/me": () => ({ status: 401 }) });
    renderPage(<DedicatedLogin role="customer" />, "/customer-login");
    expect(await axeViolations()).toEqual([]);
  });

  it("finds no problems on the grocery page", async () => {
    shopServer();
    renderPage(<InventoryPage />, "/inventory");
    await screen.findByText("Gala Apples");
    expect(await axeViolations()).toEqual([]);
  });

  it("finds no problems on the cart page", async () => {
    shopServer();
    renderPage(<CartPage />, "/cart");
    await screen.findByText("Gala Apples");
    expect(await axeViolations()).toEqual([]);
  });
});

// --- Keyboard only, no mouse ---
describe("keyboard navigation", () => {
  it("logs a manager in with only the keyboard", async () => {
    fakeServer({
      "GET /api/auth/me": () => ({ status: 401 }),
      "POST /api/auth/login": () => ({ body: { user: manager } }),
    });
    const user = userEvent.setup();
    renderPage(<DedicatedLogin role="manager" />, "/manager-login");

    // Tab past the two page links to reach the form.
    await user.tab();
    await user.tab();
    await user.tab();
    expect(screen.getByLabelText("Email:")).toHaveFocus();
    await user.keyboard("manager@ofs.com");
    await user.tab();
    expect(screen.getByLabelText("Password:")).toHaveFocus();
    await user.keyboard("manager123{Enter}");

    expect(await screen.findByText("/manager-dashboard")).toBeInTheDocument();
  });

  it("changes a cart quantity and reaches checkout with only the keyboard", async () => {
    shopServer();
    const user = userEvent.setup();
    renderPage(<CartPage />, "/cart");
    await screen.findByText("Gala Apples");

    const increase = screen.getByRole("button", { name: "Increase Gala Apples quantity" });
    while (document.activeElement !== increase) await user.tab();
    await user.keyboard("{Enter}");
    expect(await screen.findByLabelText("Quantity 3")).toBeInTheDocument();

    const checkout = screen.getByRole("button", { name: "Checkout" });
    while (document.activeElement !== checkout) await user.tab();
    await user.keyboard(" ");
    expect(screen.getByTestId("current-path")).toHaveTextContent("/checkout");
  });

  it("opens a product, adds it, and filters categories with only the keyboard", async () => {
    const { calls } = shopServer();
    const user = userEvent.setup();
    renderPage(<InventoryPage />, "/inventory");
    await screen.findByText("Gala Apples");

    const grains = screen.getByRole("button", { name: /Grains/ });
    while (document.activeElement !== grains) await user.tab();
    await user.keyboard("{Enter}");
    expect(grains).toHaveAttribute("aria-pressed", "true");

    const addRice = screen.getByRole("button", { name: "Add Jasmine Rice to cart" });
    while (document.activeElement !== addRice) await user.tab();
    await user.keyboard("{Enter}");
    expect(calls.some((call) => call.method === "POST" && call.url === "/api/cart/items")).toBe(true);
  });

  it("closes the logout question with Escape", async () => {
    shopServer();
    const user = userEvent.setup();
    renderPage(<InventoryPage />, "/inventory");
    await screen.findByText("Gala Apples");

    const logOut = await screen.findByRole("button", { name: /log out/i });
    while (document.activeElement !== logOut) await user.tab();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
