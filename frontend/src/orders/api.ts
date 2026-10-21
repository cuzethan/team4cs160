import type { CustomerOrder } from "./types";

export type CheckoutAddress = {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  deliveryInstructions: string;
};

export type CustomerTracking = {
  orderId: string;
  orderStatus: string;
  deliveryStatus: string | null;
  eta: string | null;
  stopNumber: number | null;
  runId: string | null;
  routeGeometry: [number, number][] | null;
  routeSource: "valhalla" | "approximate" | null;
  robotName: string | null;
  robotStatus: string | null;
  robotLatitude: number | null;
  robotLongitude: number | null;
};

// What the orders API sends back for each order.
type OrderRecord = {
  orderId: string;
  createdAt: string;
  orderStatus: string;
  grandTotal: number;
  items: {
    orderItemId: string;
    productId: string;
    productName: string;
    quantity: number;
    priceAtPurchase: number;
    weightAtPurchase: number;
  }[];
};

function toCustomerOrder(record: OrderRecord): CustomerOrder {
  return {
    id: record.orderId,
    date: record.createdAt,
    status: record.orderStatus,
    deliveryStatus: null,
    grandTotal: record.grandTotal,
    items: record.items.map((item) => ({
      order_item_id: item.orderItemId,
      order_id: record.orderId,
      product_id: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      price_at_purchase: item.priceAtPurchase,
      weight_at_purchase: item.weightAtPurchase,
    })),
  };
}

// Calls the orders API and throws an Error with the server's message when the request fails.
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/orders${path}`, {
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
  return data as T;
}

export async function placeOrder(address: CheckoutAddress, paymentIntentId: string) {
  return toCustomerOrder((await request<{ order: OrderRecord }>("POST", "", { address, paymentIntentId })).order);
}

export async function fetchLatestCheckoutAddress() {
  return (await request<{ address: CheckoutAddress | null }>("GET", "/latest-address")).address;
}

// Asks the server to price the cart and start a Stripe PaymentIntent. The client secret
// lets the checkout page collect the card without ever seeing the secret key.
export async function createPaymentIntent() {
  return (await request<{ clientSecret: string }>("POST", "/payment-intent")).clientSecret;
}

export async function fetchMyOrders() {
  return (await request<{ orders: OrderRecord[] }>("GET", "/mine")).orders.map(toCustomerOrder);
}

export async function fetchOrderTracking(orderId: string) {
  return (await request<{ tracking: CustomerTracking }>("GET", `/${encodeURIComponent(orderId)}/tracking`)).tracking;
}

export async function confirmOrderReceived(orderId: string) {
  return request<{ orderId: string; orderStatus: string }>("POST", `/${encodeURIComponent(orderId)}/received`);
}
