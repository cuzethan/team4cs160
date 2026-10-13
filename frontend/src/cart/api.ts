// What GET /api/cart and the other cart routes send back for each line.
export type CartLine = {
  cartItemId: string;
  productId: string;
  name: string;
  price: number;
  weightLbs: number;
  quantityInStock: number;
  quantity: number;
};

// Calls the cart API and throws an Error with the server's message when the request fails.
async function request(method: string, path: string, body?: unknown): Promise<CartLine[]> {
  let response: Response;
  try {
    response = await fetch(`/api/cart${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    throw new Error("Can't reach the server. Please try again.");
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error ?? "Something went wrong. Please try again.");
  }
  return (data as { items: CartLine[] }).items;
}

export function fetchCart() {
  return request("GET", "");
}

export function addToCart(productId: string, quantity = 1) {
  return request("POST", "/items", { productId, quantity });
}

export function updateCartItem(productId: string, quantity: number) {
  return request("PATCH", `/items/${encodeURIComponent(productId)}`, { quantity });
}

export function removeCartItem(productId: string) {
  return request("DELETE", `/items/${encodeURIComponent(productId)}`);
}
