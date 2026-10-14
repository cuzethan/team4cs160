export type SalesRange = "today" | "week" | "month" | "all";

export type SalesBucket = {
  bucketStart: string;
  paidOrders: number;
  revenue: number;
};

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