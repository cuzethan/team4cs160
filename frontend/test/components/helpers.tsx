import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { vi } from "vitest";
import { AuthProvider } from "../../src/auth/AuthContext";

type Handler = (request: { method: string; body: unknown; url: string }) => { status?: number; body?: unknown };

// A fake backend: each key is "METHOD /path" (path without the query string).
// Anything not listed answers 404, the same as an unknown route.
export function fakeServer(routes: Record<string, Handler>) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    const handler = routes[`${method} ${url.split("?")[0]}`];
    const result = handler ? handler({ method, body, url }) : { status: 404, body: { error: "Not found." } };
    const status = result.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(result.body ?? {}), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

function CurrentPath() {
  // Hidden: only the tests read it.
  return <p hidden data-testid="current-path">{useLocation().pathname}</p>;
}

// Renders a page inside the app's real login state and router.
export function renderPage(element: ReactNode, path = "/") {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={<>{element}<CurrentPath /></>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

export const shopper = { id: "u1", firstName: "Jordan", lastName: "Brooks", email: "jordan@example.com", phone: "408-555-0100", role: "customer" as const };
export const manager = { id: "m1", firstName: "Max", lastName: "Boss", email: "manager@ofs.com", phone: "408-555-0110", role: "manager" as const };

export const catalog = [
  { id: "p1", name: "Gala Apples", category: "Fruits", description: "Sweet, crisp apples.", price: 1.49, weightLbs: 1, unit: "lb", quantityInStock: 34, imageUrl: null },
  { id: "p2", name: "Jasmine Rice", category: "Grains", description: "Fragrant rice.", price: 5.99, weightLbs: 2, unit: "bag", quantityInStock: 3, imageUrl: null },
  { id: "p3", name: "Baby Spinach", category: "Vegetables", description: "Tender leaves.", price: 3.49, weightLbs: 0.31, unit: "bag", quantityInStock: 0, imageUrl: null },
];
