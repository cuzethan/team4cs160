import type { UnassignedPaidOrder } from "./store.js";

export type GeocodedLocation = { latitude: number; longitude: number };

type PhotonResponse = {
  features?: { geometry?: { coordinates?: [number, number] } }[];
};

/** Resolve an address with Photon (OSM data). Set PHOTON_URL to use a private instance. */
export async function geocodeAddress(
  address: Pick<UnassignedPaidOrder, "street" | "city" | "state" | "zipCode">,
  photonUrl = process.env.PHOTON_URL ?? "https://photon.komoot.io",
): Promise<GeocodedLocation | null> {
  const url = new URL("/api", photonUrl);
  url.searchParams.set("q", `${address.street}, ${address.city}, ${address.state} ${address.zipCode}`);
  url.searchParams.set("limit", "1");
  // Prefer locations near the store's current San Jose map center.
  url.searchParams.set("lat", "37.3382");
  url.searchParams.set("lon", "-121.8863");
  url.searchParams.set("location_bias_scale", "0.2");

  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`Photon returned HTTP ${response.status}.`);
  const data = (await response.json()) as PhotonResponse;
  const coordinates = data.features?.[0]?.geometry?.coordinates;
  if (!coordinates || coordinates.length !== 2 || !coordinates.every(Number.isFinite)) return null;
  return { longitude: coordinates[0], latitude: coordinates[1] };
}
