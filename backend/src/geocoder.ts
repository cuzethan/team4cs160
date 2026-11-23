import type { UnassignedPaidOrder } from "./store.js";
import { getRobotBaseLocation } from "./robotBase.js";

export type GeocodedLocation = { latitude: number; longitude: number };

type PhotonResponse = {
  features?: { geometry?: { coordinates?: [number, number] }; properties?: Record<string, string | undefined> }[];
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
  // Photon matches "Story Road" but not "Story Rd".
  const street = expandAbbreviations(address.street.trim().replace(/\s+/g, " "));
  url.searchParams.set("q", `${street}, ${address.city}, ${address.state} ${address.zipCode}`);
  url.searchParams.set("limit", "5");
  // Prefer locations near the configured robot base.
  const base = getRobotBaseLocation();
  url.searchParams.set("lat", String(base.latitude));
  url.searchParams.set("lon", String(base.longitude));
  url.searchParams.set("location_bias_scale", "0.2");

  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`Photon returned HTTP ${response.status}.`);
  const data = (await response.json()) as PhotonResponse;
  // Photon always answers with its closest guess, even a shop whose name shares one word with the
  // address. Only accept a place on the street that was typed, in the city or ZIP code that was typed.
  for (const feature of data.features ?? []) {
    const coordinates = feature.geometry?.coordinates;
    if (!coordinates || coordinates.length !== 2 || !coordinates.every(Number.isFinite)) continue;
    if (!isTypedAddress(feature.properties ?? {}, address)) continue;
    return { longitude: coordinates[0], latitude: coordinates[1] };
  }
  return null;
}

const NUMBER_WORDS = new Set(["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]);
// Directions and street types are often left off or abbreviated differently, so they don't have to match.
const OPTIONAL_STREET_WORDS = new Set([...Object.values({
  st: "street", rd: "road", ave: "avenue", blvd: "boulevard", dr: "drive", ln: "lane", ct: "court", pl: "place",
  sq: "square", pkwy: "parkway", hwy: "highway", cir: "circle", ter: "terrace", expy: "expressway", way: "way",
  n: "north", s: "south", e: "east", w: "west",
}), "n", "s", "e", "w", "ne", "nw", "se", "sw"]);

function isTypedAddress(place: Record<string, string | undefined>, address: { street: string; city: string; zipCode: string }) {
  // Leave out an apartment or unit number; the map only knows the building.
  const street = address.street.replace(/[.,]/g, " ").replace(/\s(#|apt|unit|suite|ste)\b.*$/i, "");
  const typedWords = expandAbbreviations(street.trim().replace(/\s+/g, " ")).toLowerCase().split(" ")
    .filter((word, index) => !(index === 0 && (/^\d+[a-z]?$/.test(word) || NUMBER_WORDS.has(word))));
  const nameWords = typedWords.filter((word) => !OPTIONAL_STREET_WORDS.has(word));
  const placeStreet = (place.street ?? (place.osm_key === "highway" ? place.name : undefined) ?? "").toLowerCase();
  if (!placeStreet || nameWords.length === 0) return false;
  const placeWords = placeStreet.replace(/[.,]/g, " ").split(/\s+/);
  if (!nameWords.every((word) => placeWords.includes(word))) return false;
  const sameCity = (place.city ?? "").toLowerCase() === address.city.trim().toLowerCase();
  const sameZip = (place.postcode ?? "").slice(0, 5) === address.zipCode.trim().slice(0, 5);
  return sameCity || sameZip;
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
export function expandAbbreviations(query: string) {
  const words = query.split(" ");
  return words.map((word, index) => {
    const key = word.replace(/\.$/, "").toLowerCase();
    // A lone N/S/E/W at the end may be the first letter of a word still being typed.
    if (key.length === 1 && index === words.length - 1) return word;
    return STREET_WORDS[key] ?? word;
  }).join(" ");
}

// Whether every word typed starts a word of the address, so "Santa Clara St" doesn't match
// "4343 Stevens Creek Blvd, Santa Clara" just because "Stevens" has "st" in it.
export function matchesTypedAddress(label: string, typed: string) {
  const words = (text: string) => expandAbbreviations(text.replace(/[.,]/g, " ").trim().replace(/\s+/g, " ")).toLowerCase().split(" ").filter(Boolean);
  const addressWords = words(label);
  return words(typed).every((part) => addressWords.some((word) => word.startsWith(part)));
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
  censusUrl = process.env.CENSUS_GEOCODER_URL ?? "https://geocoding.geo.census.gov",
): Promise<AddressSuggestion[]> {
  const expanded = expandAbbreviations(query.trim().replace(/\s+/g, " "));
  // A bare house number matches nothing useful.
  if (/^\d+[A-Za-z]?$/.test(expanded)) return [];
  const cacheKey = `${photonUrl}|${expanded.toLowerCase()}`;
  const cached = suggestionCache.get(cacheKey);
  if (cached) return cached;
  const suggestions = await findSuggestions(expanded, photonUrl, censusUrl);
  if (suggestionCache.size >= 500) suggestionCache.delete(suggestionCache.keys().next().value!);
  suggestionCache.set(cacheKey, suggestions);
  return suggestions;
}

// Every word the shopper typed for the street must start a word of the suggested street.
function matchesTypedStreet(street: string, typed: string) {
  const words = street.toLowerCase().split(/\s+/);
  return typed.toLowerCase().split(/\s+/).filter(Boolean).every((part) => words.some((word) => word.startsWith(part)));
}

// The public Photon server refuses this machine for a while after a burst of requests. Asking again
// during that time only extends the block, so wait a minute before trying again.
let photonPausedUntil = 0;
const PHOTON_PAUSE_MS = 60_000;

export function resetSuggestionPause() {
  photonPausedUntil = 0;
  suggestionCache.clear();
}

// The ZIP code of one exact house from the Census geocoder, or "" when it doesn't know the house.
async function censusZip(street: string, city: string, state: string, censusUrl: string) {
  try {
    const url = new URL("/geocoder/locations/onelineaddress", censusUrl);
    url.searchParams.set("address", `${street}, ${city}, ${state}`);
    url.searchParams.set("benchmark", "Public_AR_Current");
    url.searchParams.set("format", "json");
    const response = await fetch(url, { signal: AbortSignal.timeout(4_000) });
    if (!response.ok) return "";
    const data = (await response.json()) as { result?: { addressMatches?: { addressComponents?: { zip?: string } }[] } };
    const zip = data.result?.addressMatches?.[0]?.addressComponents?.zip ?? "";
    return /^\d{5}$/.test(zip) ? zip : "";
  } catch {
    return "";
  }
}

async function findSuggestions(expanded: string, photonUrl: string, censusUrl: string): Promise<AddressSuggestion[]> {
  const typedNumber = /^(\d+[A-Za-z]?)\s+(.+)$/.exec(expanded);
  const base = getRobotBaseLocation();

  async function search(text: string, layer: "house" | "street") {
    if (Date.now() < photonPausedUntil) throw new Error("Address suggestions are paused.");
    try {
      return await searchPhoton(text, layer);
    } catch (error) {
      photonPausedUntil = Date.now() + PHOTON_PAUSE_MS;
      throw error;
    }
  }

  async function searchPhoton(text: string, layer: "house" | "street") {
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

  const suggestions: AddressSuggestion[] = [];
  // A street's ZIP code in OpenStreetMap is just one of the ZIP codes it runs through, so a house
  // number put on a street gets its ZIP code from the Census geocoder. When Census doesn't know the
  // house, the street's ZIP code is kept, since it's right for most streets.
  const needZip: AddressSuggestion[] = [];
  function add(place: PhotonPlace, street: string, exactHouse = true) {
    const state = STATE_CODES[place.state ?? ""] ?? (/^[A-Z]{2}$/.test(place.state ?? "") ? place.state! : "");
    const zipCode = (place.postcode ?? "").slice(0, 5);
    if (place.countrycode !== "US" || !place.city || !state || !/^\d{5}$/.test(zipCode)) return;
    if (suggestions.length === 5 || suggestions.some((s) => s.street === street && s.city === place.city)) return;
    const suggestion = { label: `${street}, ${place.city}, ${state} ${zipCode}`, street, city: place.city, state, zipCode };
    if (!exactHouse) needZip.push(suggestion);
    suggestions.push(suggestion);
  }

  // One request at a time, and the street lookup only when the houses didn't fill the list.
  const houses = await search(expanded, "house");
  for (const place of houses) {
    if (!place.housenumber || !place.street) continue;
    if (typedNumber && (!place.housenumber.toLowerCase().startsWith(typedNumber[1].toLowerCase()) ||
        !matchesTypedStreet(place.street, typedNumber[2]))) continue;
    add(place, `${place.housenumber} ${place.street}`);
  }
  if (typedNumber && suggestions.length < 3) {
    const streets = await search(typedNumber[2], "street");
    for (const place of streets) if (place.name && matchesTypedStreet(place.name, typedNumber[2])) add(place, `${typedNumber[1]} ${place.name}`, false);
    await Promise.all(needZip.map(async (suggestion) => {
      suggestion.zipCode = await censusZip(suggestion.street, suggestion.city, suggestion.state, censusUrl) || suggestion.zipCode;
      suggestion.label = `${suggestion.street}, ${suggestion.city}, ${suggestion.state} ${suggestion.zipCode}`;
    }));
  }
  return suggestions;
}
