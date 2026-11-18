import type { UnassignedPaidOrder } from "./store.js";
import { getRobotBaseLocation } from "./robotBase.js";

export type GeocodedLocation = { latitude: number; longitude: number };

type PhotonResponse = {
  features?: { geometry?: { coordinates?: [number, number] } }[];
};

/**
 * Resolve an address with Photon (OSM data), falling back to the US Census geocoder when Photon
 * is unreachable or can't find it. Set PHOTON_URL to use a private Photon instance.
 */
export async function geocodeAddress(
  address: Pick<UnassignedPaidOrder, "street" | "city" | "state" | "zipCode">,
  photonUrl = process.env.PHOTON_URL ?? "https://photon.komoot.io",
  censusUrl = process.env.CENSUS_GEOCODER_URL ?? "https://geocoding.geo.census.gov",
): Promise<GeocodedLocation | null> {
  let photonError: unknown = null;
  try {
    const found = await geocodeWithPhoton(address, photonUrl);
    if (found) return found;
  } catch (error) {
    photonError = error;
  }
  try {
    const found = await geocodeWithCensus(address, censusUrl);
    if (found) return found;
  } catch {
    // Both services down: report it as an outage so the order stays queued.
    if (photonError) throw photonError;
    return null;
  }
  if (photonError) throw photonError;
  return null;
}

async function geocodeWithPhoton(
  address: Pick<UnassignedPaidOrder, "street" | "city" | "state" | "zipCode">,
  photonUrl: string,
): Promise<GeocodedLocation | null> {
  const url = new URL("/api", photonUrl);
  url.searchParams.set("q", `${address.street}, ${address.city}, ${address.state} ${address.zipCode}`);
  url.searchParams.set("limit", "1");
  // Prefer locations near the configured robot base.
  const base = getRobotBaseLocation();
  url.searchParams.set("lat", String(base.latitude));
  url.searchParams.set("lon", String(base.longitude));
  url.searchParams.set("location_bias_scale", "0.2");

  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`Photon returned HTTP ${response.status}.`);
  const data = (await response.json()) as PhotonResponse;
  const coordinates = data.features?.[0]?.geometry?.coordinates;
  if (!coordinates || coordinates.length !== 2 || !coordinates.every(Number.isFinite)) return null;
  return { longitude: coordinates[0], latitude: coordinates[1] };
}

type CensusResponse = {
  result?: { addressMatches?: { coordinates?: { x?: number; y?: number } }[] };
};

async function geocodeWithCensus(
  address: Pick<UnassignedPaidOrder, "street" | "city" | "state" | "zipCode">,
  censusUrl: string,
): Promise<GeocodedLocation | null> {
  const url = new URL("/geocoder/locations/onelineaddress", censusUrl);
  url.searchParams.set("address", `${address.street}, ${address.city}, ${address.state} ${address.zipCode}`);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("format", "json");

  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`Census geocoder returned HTTP ${response.status}.`);
  const data = (await response.json()) as CensusResponse;
  const { x, y } = data.result?.addressMatches?.[0]?.coordinates ?? {};
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { longitude: x, latitude: y };
}
