// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DedicatedLogin } from "../../src/login/Login";
import { fakeServer, manager, renderPage } from "./helpers";

// Part 2, client layer: "Manager Dashboard Login".
describe("manager dashboard login", () => {
  function managerServer() {
    return fakeServer({
      "GET /api/auth/me": () => ({ status: 401, body: { error: "Not logged in." } }),
      "POST /api/auth/login": ({ body }) => {
        const { email, password, role } = body as { email: string; password: string; role: string };
        return email === "manager@ofs.com" && password === "manager123" && role === "manager"
          ? { body: { user: manager } }
          : { status: 401, body: { error: "Incorrect email or password." } };
      },
    });
  }

  it("opens the dashboard after valid manager credentials", async () => {
    const { calls } = managerServer();
    const user = userEvent.setup();
    renderPage(<DedicatedLogin role="manager" />, "/manager-login");

    await user.type(screen.getByLabelText("Email:"), "manager@ofs.com");
    await user.type(screen.getByLabelText("Password:"), "manager123");
    await user.click(screen.getByRole("button", { name: "Manager Login" }));

    expect(await screen.findByText("/manager-dashboard")).toBeInTheDocument();
    expect(calls.find((call) => call.url === "/api/auth/login")?.body).toEqual({ email: "manager@ofs.com", password: "manager123", role: "manager" });
  });

  it("shows an error and stays on the login page for wrong credentials", async () => {
    managerServer();
    const user = userEvent.setup();
    renderPage(<DedicatedLogin role="manager" />, "/manager-login");

    await user.type(screen.getByLabelText("Email:"), "manager@ofs.com");
    await user.type(screen.getByLabelText("Password:"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Manager Login" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
    expect(screen.getByTestId("current-path")).toHaveTextContent("/manager-login");
    expect(screen.getByRole("button", { name: "Manager Login" })).toBeEnabled();
  });

  it("sends customers to the store, not the dashboard", async () => {
    fakeServer({
      "GET /api/auth/me": () => ({ status: 401 }),
      "POST /api/auth/login": () => ({ body: { user: { ...manager, role: "customer" } } }),
    });
    const user = userEvent.setup();
    renderPage(<DedicatedLogin role="customer" />, "/customer-login");

    await user.type(screen.getByLabelText("Email:"), "jordan@example.com");
    await user.type(screen.getByLabelText("Password:"), "customer123");
    await user.click(screen.getByRole("button", { name: "Customer Login" }));

    expect(await screen.findByTestId("current-path")).toHaveTextContent(/^\/$/);
  });
});
