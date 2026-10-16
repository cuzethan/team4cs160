export type SalesRange = "today" | "week" | "month" | "all";

export type SalesBucket = {
  bucketStart: string;
  paidOrders: number;
  revenue: number;
};

export type DeliverySettings = { deliveryFee: number; freeDeliveryWeightThreshold: number };

async function settingsRequest(method: "GET" | "PUT", settings?: DeliverySettings): Promise<DeliverySettings> {
  let response: Response;
  try {
    response = await fetch("/api/settings", {
      method, credentials: "same-origin",
      headers: settings ? { "Content-Type": "application/json" } : undefined,
      body: settings ? JSON.stringify(settings) : undefined,
    });
  } catch {
    throw new Error("Can't reach the server. Please try again.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Unable to save delivery settings.");
  return data as DeliverySettings;
}

export const fetchDeliverySettings = () => settingsRequest("GET");
export const saveDeliverySettings = (settings: DeliverySettings) => settingsRequest("PUT", settings);

export type ManagerDelivery = {
  orderId: string;
  customerName: string;
  deliveryProgress: string;
  eta: string | null;
};

export async function fetchDeliveries(): Promise<ManagerDelivery[]> {
  let response: Response;
  try {
    response = await fetch("/api/manager/deliveries", { credentials: "same-origin" });
  } catch {
    throw new Error("Can't reach the server. Please try again.");
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Unable to load deliveries.");
  return data.deliveries as ManagerDelivery[];
}
export async function fetchSales(range: SalesRange) {
  let response: Response;
  try {
    response = await fetch(`/api/manager/sales?range=${range}`, { credentials: "same-origin" });
  } catch {
    throw new Error("Can't reach the server. Please try again.");
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Unable to load sales data.");
  return data.sales as SalesBucket[];
}

export type ManagedProduct = {
  id: string;
  name: string;
  category: string;
  categoryId: string | null;
  description: string;
  price: number;
  weightLbs: number;
  unit: string;
  quantityInStock: number;
  imageUrl: string | null;
  active: boolean;
};

export type ProductCategory = { id: string; name: string };

export type ProductInput = {
  name: string;
  description: string;
  price: number;
  weightLbs: number;
  unit: string;
  categoryId: string;
};

async function inventoryRequest<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/manager/inventory${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Can't reach the server. Please try again.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Unable to update the product catalog.");
  return data as T;
}

// Every product, including deactivated ones, plus the categories a product can be in.
export const fetchManagedInventory = () =>
  inventoryRequest<{ products: ManagedProduct[]; categories: ProductCategory[] }>("GET", "");

export async function createProduct(product: ProductInput & { quantityInStock: number }) {
  return (await inventoryRequest<{ product: ManagedProduct }>("POST", "", product)).product;
}

export async function updateProduct(productId: string, changes: Partial<ProductInput> & { active?: boolean }) {
  return (await inventoryRequest<{ product: ManagedProduct }>("PATCH", `/${encodeURIComponent(productId)}`, changes)).product;
}
