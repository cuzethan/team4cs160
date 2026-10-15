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
