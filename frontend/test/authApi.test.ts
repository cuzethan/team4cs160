import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCurrentUser, login, logout } from "../src/auth/api";

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(body === null ? null : JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("auth api client", () => {
  it("posts the login form and returns the user", async () => {
    const user = { id: "1", firstName: "Lee", role: "customer" };
    const fetchMock = mockFetch(200, { user });

    await expect(login("lee@ofs.com", "carrots123", "customer")).resolves.toEqual(user);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/auth/login");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ email: "lee@ofs.com", password: "carrots123", role: "customer" });
  });

  it("throws the server's error message", async () => {
    mockFetch(401, { error: "Incorrect email or password." });
    await expect(login("lee@ofs.com", "nope", "customer")).rejects.toThrow("Incorrect email or password.");
  });

  it("explains when the server can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await expect(login("lee@ofs.com", "x", "customer")).rejects.toThrow("Can't reach the server");
  });

  it("returns null for the current user when not logged in", async () => {
    mockFetch(401, { error: "Not logged in." });
    await expect(fetchCurrentUser()).resolves.toBeNull();
  });

  it("handles the empty logout response", async () => {
    mockFetch(204, null);
    await expect(logout()).resolves.toBeUndefined();
  });
});
