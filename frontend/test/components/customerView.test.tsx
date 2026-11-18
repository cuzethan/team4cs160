// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { InventoryPage } from "../../src/inventory/InventoryPage";
import { catalog, fakeServer, renderPage, shopper } from "./helpers";

function storeServer(products = catalog) {
  return fakeServer({
    "GET /api/auth/me": () => ({ body: { user: shopper } }),
    "GET /api/products": () => ({ body: { products } }),
    "GET /api/notifications": () => ({ body: { notifications: [] } }),
    "POST /api/cart/items": () => ({ body: { items: [] } }),
  });
}

const card = (name: string) => screen.getByRole("button", { name: `View details for ${name}` }).closest("article")!;

// Part 2, client layer: "Customer View Display".
describe("customer product view", () => {
  it("shows every product with its name, price, category and stock", async () => {
    storeServer();
    renderPage(<InventoryPage />, "/inventory");

    expect(await screen.findByText("Gala Apples")).toBeInTheDocument();
    expect(screen.getByText("Showing")).toHaveTextContent("Showing 3 items");
    const apples = within(card("Gala Apples"));
    expect(apples.getByText("$1.49")).toBeInTheDocument();
    expect(apples.getByText("Fruits")).toBeInTheDocument();
    expect(apples.getByText("34 in stock")).toBeInTheDocument();
  });

  it("shows a loading message, then a clear error the shopper can retry", async () => {
    let fail = true;
    fakeServer({
      "GET /api/auth/me": () => ({ status: 401 }),
      "GET /api/products": () => (fail ? { status: 500, body: { error: "We couldn't load the groceries." } } : { body: { products: catalog } }),
    });
    const user = userEvent.setup();
    renderPage(<InventoryPage />, "/inventory");

    expect(screen.getByRole("status")).toHaveTextContent("Loading groceries");
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load the groceries.");

    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Gala Apples")).toBeInTheDocument();
  });

  it("filters by category and search, and sorts by price", async () => {
    storeServer();
    const user = userEvent.setup();
    renderPage(<InventoryPage />, "/inventory");
    await screen.findByText("Gala Apples");

    await user.click(screen.getByRole("button", { name: /Grains/ }));
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Jasmine Rice"]);

    await user.click(screen.getByRole("button", { name: /All groceries/ }));
    await user.type(screen.getByRole("searchbox", { name: "Search groceries" }), "spinach");
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Baby Spinach"]);

    await user.clear(screen.getByRole("searchbox", { name: "Search groceries" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Sort products" }), "price-high");
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Jasmine Rice", "Baby Spinach", "Gala Apples"]);

    await user.type(screen.getByRole("searchbox", { name: "Search groceries" }), "chocolate");
    expect(screen.getByText("No groceries match your search.")).toBeInTheDocument();
  });

  it("adds a product to the cart and confirms it", async () => {
    const { calls } = storeServer();
    const user = userEvent.setup();
    renderPage(<InventoryPage />, "/inventory");
    await screen.findByText("Gala Apples");

    await user.click(screen.getByRole("button", { name: "Add Gala Apples to cart" }));

    expect(await screen.findByText("Added 1 × Gala Apples to your cart.")).toBeInTheDocument();
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({ productId: "p1", quantity: 1 });
  });
});

// Part 2, client layer: "Update Item Display".
describe("product stock display", () => {
  it("marks sold-out items and stops them being added", async () => {
    storeServer();
    renderPage(<InventoryPage />, "/inventory");
    await screen.findByText("Baby Spinach");

    expect(within(card("Baby Spinach")).getByText("Out of stock")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Baby Spinach to cart" })).toBeDisabled();
  });

  it("warns when only a few are left", async () => {
    storeServer();
    renderPage(<InventoryPage />, "/inventory");
    await screen.findByText("Jasmine Rice");

    expect(within(card("Jasmine Rice")).getByText("Only 3 left")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Jasmine Rice to cart" })).toBeEnabled();
  });

  it("shows a manager's price and stock changes the next time the page loads", async () => {
    storeServer([{ ...catalog[0], price: 1.99, quantityInStock: 0 }]);
    renderPage(<InventoryPage />, "/inventory");
    await screen.findByText("Gala Apples");

    const apples = within(card("Gala Apples"));
    expect(apples.getByText("$1.99")).toBeInTheDocument();
    expect(apples.getByText("Out of stock")).toBeInTheDocument();
  });
});
