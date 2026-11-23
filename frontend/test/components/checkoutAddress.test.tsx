// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CheckoutPage } from "../../src/checkout/CheckoutPage";
import { fakeServer, renderPage, shopper } from "./helpers";

const saved = { street: "1 Washington Square", city: "San Jose", state: "CA", zipCode: "95192", deliveryInstructions: "" };
const apples = { cartItemId: "c1", productId: "p1", name: "Gala Apples", category: "Fruits", unit: "lb", price: 1.49, weightLbs: 1, quantityInStock: 34, quantity: 2, active: true };

function checkoutServer(validate: (address: Record<string, string>) => { status?: number; body?: unknown } = () => ({ body: { eligible: true, estimatedMinutes: 40 } })) {
  return fakeServer({
    "GET /api/auth/me": () => ({ body: { user: shopper } }),
    "GET /api/cart": () => ({ body: { items: [apples] } }),
    "GET /api/orders/latest-address": () => ({ body: { address: saved } }),
    "GET /api/settings": () => ({ body: { deliveryFee: 10, freeDeliveryWeightThreshold: 20, deliveryRadiusMiles: 50 } }),
    "GET /api/orders/address-suggestions": () => ({ body: { suggestions: [] } }),
    "POST /api/orders/validate-address": ({ body }) => validate((body as { address: Record<string, string> }).address),
  });
}

describe("checkout address", () => {
  it("clears the saved city, state and ZIP code when a new street is typed", async () => {
    checkoutServer();
    const user = userEvent.setup();
    renderPage(<CheckoutPage />, "/checkout");
    const street = await screen.findByRole("combobox", { name: "Street address" });
    await waitFor(() => expect(street).toHaveValue("1 Washington Square"));

    await user.clear(street);
    await user.type(street, "200 E Santa Clara St");

    expect(screen.getByLabelText("City")).toHaveValue("");
    expect(screen.getByLabelText("State")).toHaveValue("");
    expect(screen.getByLabelText("ZIP code")).toHaveValue("");
  });

  it("keeps the other fields when only the ZIP code is corrected", async () => {
    checkoutServer();
    const user = userEvent.setup();
    renderPage(<CheckoutPage />, "/checkout");
    const zip = await screen.findByLabelText("ZIP code");
    await waitFor(() => expect(zip).toHaveValue("95192"));

    await user.clear(zip);
    await user.type(zip, "95112");

    expect(screen.getByLabelText("City")).toHaveValue("San Jose");
    expect(screen.getByRole("combobox", { name: "Street address" })).toHaveValue("1 Washington Square");
  });

  it("shows what's wrong with the address next to the address fields", async () => {
    checkoutServer((address) => address.zipCode === "90210"
      ? { status: 400, body: { error: "The ZIP code for this address is 95192, not 90210. Please check the ZIP code." } }
      : { body: { eligible: true, estimatedMinutes: 40 } });
    const user = userEvent.setup();
    renderPage(<CheckoutPage />, "/checkout");
    const zip = await screen.findByLabelText("ZIP code");
    await waitFor(() => expect(zip).toHaveValue("95192"));

    await user.clear(zip);
    await user.type(zip, "90210");

    const section = screen.getByRole("region", { name: "Delivery address" });
    expect(await screen.findByText(/The ZIP code for this address is 95192/)).toBeInTheDocument();
    expect(section).toContainElement(screen.getByText(/The ZIP code for this address is 95192/));
  });

  it("doesn't submit the order when Enter is pressed in an address field", async () => {
    checkoutServer();
    const user = userEvent.setup();
    renderPage(<CheckoutPage />, "/checkout");
    const city = await screen.findByLabelText("City");
    let submitted = false;
    city.closest("form")!.addEventListener("submit", () => { submitted = true; });

    await user.type(city, "{Enter}");

    expect(submitted).toBe(false);
  });
});
