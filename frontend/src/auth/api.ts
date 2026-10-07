export type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: "customer" | "manager";
};

export type RegisterInput = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  password: string;
};

// Calls the backend and throws an Error with the server's message when the request fails.
async function request<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/auth${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    throw new Error("Can't reach the server. Please try again.");
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error ?? "Something went wrong. Please try again.");
  }
  return data as T;
}

export async function login(email: string, password: string, role: User["role"]) {
  return (await request<{ user: User }>("/login", { email, password, role })).user;
}

export async function register(input: RegisterInput) {
  return (await request<{ user: User }>("/register", input)).user;
}

export async function logout() {
  await request<null>("/logout", {});
}

// Returns the logged-in user, or null if there isn't one.
export async function fetchCurrentUser() {
  try {
    return (await request<{ user: User }>("/me")).user;
  } catch {
    return null;
  }
}

export async function requestPasswordReset(email: string) {
  return (await request<{ message: string }>("/forgot-password", { email })).message;
}

export async function resetPassword(token: string, password: string) {
  return (await request<{ message: string }>("/reset-password", { token, password })).message;
}
