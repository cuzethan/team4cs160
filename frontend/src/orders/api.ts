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
  deliveryAddress: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    deliveryInstructions: string | null;
  };
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

// Checks the address is in the delivery area and returns a rough delivery time in minutes.
export async function validateDeliveryAddress(address: CheckoutAddress) {
  return (await request<{ eligible: true; estimatedMinutes: number }>("POST", "/validate-address", { address })).estimatedMinutes;
}

// { duration: "About 1 hr 30 min", arrival: "4:35 PM" } for an estimate made at `from`.
export function formatDeliveryEstimate(minutes: number, from: Date = new Date()) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const length = hours === 0 ? `${rest} min` : rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
  const arrival = new Date(from.getTime() + minutes * 60_000).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return { duration: `About ${length}`, arrival };
}

export async function fetchLatestCheckoutAddress() {
  return (await request<{ address: CheckoutAddress | null }>("GET", "/latest-address")).address;
}

// Tells the server a card was declined, for the manager's failed-payments report. The server
// reads the details from Stripe; the checkout page doesn't wait for or depend on this.
export async function reportFailedPayment(paymentIntentId: string) {
  await request<null>("POST", "/payment-failed", { paymentIntentId });
}

// Asks the server to price the cart and start a Stripe PaymentIntent. The client secret
// lets the checkout page collect the card without ever seeing the secret key.
// The card form needs the payment's secret; the customer session secret (when the server
// sends one) lets it show the shopper's saved cards and offer to save a new one.
export async function createPaymentIntent() {
  const data = await request<{ clientSecret: string; customerSessionClientSecret?: string | null }>("POST", "/payment-intent");
  return { clientSecret: data.clientSecret, customerSessionClientSecret: data.customerSessionClientSecret ?? null };
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
