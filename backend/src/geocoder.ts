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

export type AddressSuggestion = { label: string; street: string; city: string; state: string; zipCode: string };

type PhotonPlace = Record<string, string | undefined>;
type PhotonSuggestionResponse = { features?: { properties?: PhotonPlace }[] };

const STREET_WORDS: Record<string, string> = {
  st: "Street", rd: "Road", ave: "Avenue", av: "Avenue", blvd: "Boulevard", dr: "Drive", ln: "Lane", ct: "Court",
  pl: "Place", sq: "Square", pkwy: "Parkway", hwy: "Highway", cir: "Circle", ter: "Terrace", expy: "Expressway",
  n: "North", s: "South", e: "East", w: "West",
};

// Photon matches "Story Road" but not "Story Rd", so spell out the usual abbreviations.
function expandAbbreviations(query: string) {
  const words = query.split(" ");
  return words.map((word, index) => {
    const key = word.replace(/\.$/, "").toLowerCase();
    // A lone N/S/E/W at the end may be the first letter of a word still being typed.
    if (key.length === 1 && index === words.length - 1) return word;
    return STREET_WORDS[key] ?? word;
  }).join(" ");
}

const STATE_CODES: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO", Connecticut: "CT",
  Delaware: "DE", "District of Columbia": "DC", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL",
  Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT",
  Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA",
  "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT",
  Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
};

/**
 * Street addresses matching what a shopper has typed so far, limited to the area around the robot base.
 * Many homes have no house number in OpenStreetMap, so when the shopper typed a number and only the
 * street is known, the suggestion puts their number on that street.
 */
// Recent answers, so retyping or backspacing doesn't ask Photon again.
const suggestionCache = new Map<string, AddressSuggestion[]>();

export async function suggestAddresses(
  query: string,
  photonUrl = process.env.PHOTON_URL ?? "https://photon.komoot.io",
): Promise<AddressSuggestion[]> {
  const expanded = expandAbbreviations(query.trim().replace(/\s+/g, " "));
  // A bare house number matches nothing useful.
  if (/^\d+[A-Za-z]?$/.test(expanded)) return [];
  const cacheKey = `${photonUrl}|${expanded.toLowerCase()}`;
  const cached = suggestionCache.get(cacheKey);
  if (cached) return cached;
  const suggestions = await findSuggestions(expanded, photonUrl);
  if (suggestionCache.size >= 500) suggestionCache.delete(suggestionCache.keys().next().value!);
  suggestionCache.set(cacheKey, suggestions);
  return suggestions;
}

// Every word the shopper typed for the street must start a word of the suggested street.
function matchesTypedStreet(street: string, typed: string) {
  const words = street.toLowerCase().split(/\s+/);
  return typed.toLowerCase().split(/\s+/).filter(Boolean).every((part) => words.some((word) => word.startsWith(part)));
}

async function findSuggestions(expanded: string, photonUrl: string): Promise<AddressSuggestion[]> {
  const typedNumber = /^(\d+[A-Za-z]?)\s+(.+)$/.exec(expanded);
  const base = getRobotBaseLocation();

  async function search(text: string, layer: "house" | "street") {
    const url = new URL("/api", photonUrl);
    url.searchParams.set("q", text);
    url.searchParams.set("limit", "10");
    url.searchParams.set("layer", layer);
    url.searchParams.set("lat", String(base.latitude));
    url.searchParams.set("lon", String(base.longitude));
    // About 50 miles in every direction from the base.
    url.searchParams.set("bbox", [base.longitude - 0.75, base.latitude - 0.75, base.longitude + 0.75, base.latitude + 0.75].join(","));
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`Photon returned HTTP ${response.status}.`);
    const data = (await response.json()) as PhotonSuggestionResponse;
    return (data.features ?? []).map((feature) => feature.properties ?? {});
  }

  const [houses, streets] = await Promise.all([
    search(expanded, "house"),
    typedNumber ? search(typedNumber[2], "street") : Promise.resolve([] as PhotonPlace[]),
  ]);

  const suggestions: AddressSuggestion[] = [];
  function add(place: PhotonPlace, street: string) {
    const state = STATE_CODES[place.state ?? ""] ?? (/^[A-Z]{2}$/.test(place.state ?? "") ? place.state! : "");
    const zipCode = (place.postcode ?? "").slice(0, 5);
    if (place.countrycode !== "US" || !place.city || !state || !/^\d{5}$/.test(zipCode)) return;
    if (suggestions.length === 5 || suggestions.some((s) => s.street === street && s.city === place.city)) return;
    suggestions.push({ label: `${street}, ${place.city}, ${state} ${zipCode}`, street, city: place.city, state, zipCode });
  }

  for (const place of houses) {
    if (!place.housenumber || !place.street) continue;
    if (typedNumber && (!place.housenumber.toLowerCase().startsWith(typedNumber[1].toLowerCase()) ||
        !matchesTypedStreet(place.street, typedNumber[2]))) continue;
    add(place, `${place.housenumber} ${place.street}`);
  }
  if (typedNumber) {
    for (const place of streets) if (place.name && matchesTypedStreet(place.name, typedNumber[2])) add(place, `${typedNumber[1]} ${place.name}`);
  }
  return suggestions;
}
