// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { StreetAddressInput } from "../../src/checkout/StreetAddressInput";
import type { AddressSuggestion } from "../../src/orders/api";
import { fakeServer } from "./helpers";

const cityHall = { label: "200 East Santa Clara Street, San Jose, CA 95112", street: "200 East Santa Clara Street", city: "San Jose", state: "CA", zipCode: "95112" };
const sjsu = { label: "1 Washington Square, San Jose, CA 95192", street: "1 Washington Square", city: "San Jose", state: "CA", zipCode: "95192" };

function Form() {
  const [street, setStreet] = useState("");
  const [picked, setPicked] = useState<AddressSuggestion | null>(null);
  return (
    <form onSubmit={(event) => { event.preventDefault(); setPicked({ ...cityHall, label: "submitted" }); }}>
      <label>Street address<StreetAddressInput value={street} onChange={setStreet} onPick={(s) => { setStreet(s.street); setPicked(s); }} className="" /></label>
      <output data-testid="picked">{picked ? `${picked.city}|${picked.state}|${picked.zipCode}` : ""}</output>
    </form>
  );
}

// Like the server: text under 3 characters only matches the shopper's saved addresses.
function suggestionServer(suggestions: AddressSuggestion[], saved: AddressSuggestion[] = []) {
  return fakeServer({
    "GET /api/orders/address-suggestions": ({ url }) => {
      const q = new URLSearchParams(url.split("?")[1]).get("q") ?? "";
      return { body: { suggestions: q.length < 3 ? saved : [...saved, ...suggestions] } };
    },
  });
}

describe("street address suggestions", () => {
  it("shows matches as the shopper types and fills the address when one is clicked", async () => {
    const { calls } = suggestionServer([cityHall, sjsu]);
    const user = userEvent.setup();
    render(<Form />);

    await user.type(screen.getByRole("combobox", { name: "Street address" }), "200 E Santa");
    await waitFor(() => expect(decodeURIComponent(calls.at(-1)!.url)).toContain("q=200 E Santa"));
    await user.click(await screen.findByRole("option", { name: cityHall.label }));

    expect(screen.getByRole("combobox")).toHaveValue("200 East Santa Clara Street");
    expect(screen.getByTestId("picked")).toHaveTextContent("San Jose|CA|95112");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("can be used with the arrow keys, Enter and Escape", async () => {
    suggestionServer([cityHall, sjsu]);
    const user = userEvent.setup();
    render(<Form />);
    const field = screen.getByRole("combobox", { name: "Street address" });

    await user.type(field, "1 Wash");
    await screen.findByRole("listbox");
    await user.keyboard("{Escape}");
    expect(field).toHaveAttribute("aria-expanded", "false");

    await user.type(field, "i");
    await screen.findByRole("listbox");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("option", { name: sjsu.label })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Enter}");

    expect(field).toHaveValue("1 Washington Square");
    expect(screen.getByTestId("picked")).toHaveTextContent("San Jose|CA|95192");
  });

  it("stays a plain text field when suggestions are unavailable", async () => {
    fakeServer({ "GET /api/orders/address-suggestions": () => ({ status: 503, body: { error: "down" } }) });
    const user = userEvent.setup();
    render(<Form />);

    await user.type(screen.getByRole("combobox", { name: "Street address" }), "769 Willow St");
    await new Promise((resolve) => setTimeout(resolve, 450));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("769 Willow St");
    expect(screen.getByText(/Address search is busy/)).toBeInTheDocument();
  });

  it("shows the shopper's past addresses as soon as the field is clicked", async () => {
    suggestionServer([cityHall], [sjsu]);
    const user = userEvent.setup();
    render(<Form />);

    await user.click(screen.getByRole("combobox", { name: "Street address" }));

    expect(await screen.findByRole("option", { name: sjsu.label })).toBeInTheDocument();
  });

  it("says when nothing matches or the search is busy", async () => {
    suggestionServer([]);
    const user = userEvent.setup();
    render(<Form />);
    await user.type(screen.getByRole("combobox", { name: "Street address" }), "99999 Nowhere");
    expect(await screen.findByText(/No matching addresses yet/)).toBeInTheDocument();
  });
});
