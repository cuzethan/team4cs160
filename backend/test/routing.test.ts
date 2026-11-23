import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchPendingOrders } from "../src/batching.js";
import { geocodeAddress, suggestAddresses } from "../src/geocoder.js";
import { calculateDeliveryRoute, type RoutePoint } from "../src/routeService.js";
import { configureRobotBaseLocation, getRobotBaseLocation, isAtRobotBaseLocation } from "../src/robotBase.js";
import type { DeliveryStore } from "../src/store.js";

const depot: RoutePoint = { id: "depot", latitude: 37.3382, longitude: -121.8863 };
const near: RoutePoint = { id: "near", latitude: 37.3392, longitude: -121.8863 };
const far: RoutePoint = { id: "far", latitude: 37.3482, longitude: -121.8863 };

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

// Precision-6 polyline encoding, the format Valhalla uses for route shapes.
function encode(points: [number, number][]) {
  let output = "";
  let last = [0, 0];
  const encodeValue = (value: number) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    while (v >= 0x20) {
      output += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    output += String.fromCharCode(v + 63);
  };
  for (const [lon, lat] of points) {
    const next = [Math.round(lat * 1e6), Math.round(lon * 1e6)];
    encodeValue(next[0] - last[0]);
    encodeValue(next[1] - last[1]);
    last = next;
  }
  return output;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("delivery route without a map server", () => {
  it("visits the nearest stop first and returns to the depot", async () => {
    const route = await calculateDeliveryRoute(depot, [far, near], "");

    expect(route.source).toBe("approximate");
    expect(route.orderedStopIds).toEqual(["near", "far"]);
    expect((await calculateDeliveryRoute(depot, [near, far], "")).orderedStopIds).toEqual(["near", "far"]);
    expect(route.arrivalOffsetsSeconds.near).toBeLessThan(route.arrivalOffsetsSeconds.far);
    expect(route.geometry[0]).toEqual([depot.longitude, depot.latitude]);
    expect(route.geometry.at(-1)).toEqual([depot.longitude, depot.latitude]);
    // About 1.1 km out and back at 1.2 m/s.
    expect(route.distanceMeters).toBeGreaterThan(2000);
    expect(route.durationSeconds).toBe(Math.round(route.distanceMeters / 1.2));
  });

  it("rejects routes it can't build", async () => {
    await expect(calculateDeliveryRoute(depot, [], "")).rejects.toThrow("at least one order");
    const eleven = Array.from({ length: 11 }, (_, i) => ({ ...near, id: `s${i}` }));
    await expect(calculateDeliveryRoute(depot, eleven, "")).rejects.toThrow("at most 10");
    await expect(calculateDeliveryRoute(depot, [near, near], "")).rejects.toThrow("unique");
    await expect(calculateDeliveryRoute(depot, [{ ...near, id: "depot" }], "")).rejects.toThrow("unique");
    await expect(calculateDeliveryRoute({ ...depot, id: "" }, [near], "")).rejects.toThrow("valid latitude");
    await expect(calculateDeliveryRoute(depot, [{ ...near, latitude: 95 }], "")).rejects.toThrow("outside the valid range");
  });
});

describe("delivery route with a map server", () => {
  it("uses the map server's stop order, path and times", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      trip: {
        locations: [{ original_index: 0 }, { original_index: 2 }, { original_index: 1 }, { original_index: 3 }],
        legs: [
          { shape: encode([[-121.8863, 37.3382], [-121.8863, 37.3392]]), summary: { length: 0.1, time: 90 } },
          { shape: encode([[-121.8863, 37.3392], [-121.8863, 37.3482]]), summary: { length: 1, time: 800 } },
          { summary: { length: 1.1, time: 900 } },
        ],
        summary: { length: 2.2, time: 1790 },
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const route = await calculateDeliveryRoute(depot, [far, near], "http://valhalla:8002");

    expect(String(fetchMock.mock.calls[0][0])).toContain("/optimized_route");
    expect(route).toMatchObject({
      source: "valhalla",
      orderedStopIds: ["near", "far"],
      distanceMeters: 2200,
      durationSeconds: 1790,
      arrivalOffsetsSeconds: { near: 90, far: 890 },
    });
    expect(route.geometry).toEqual([[-121.8863, 37.3382], [-121.8863, 37.3392], [-121.8863, 37.3482]]);
  });

  it("asks for a plain route for a single stop and fills in a missing path", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      trip: { locations: [{}, {}, {}], legs: [{}, {}], summary: {} },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const route = await calculateDeliveryRoute(depot, [near], "http://valhalla:8002");

    expect(String(fetchMock.mock.calls[0][0])).toContain("/route?");
    expect(route.orderedStopIds).toEqual(["near"]);
    expect(route.geometry).toHaveLength(3);
    expect(route.durationSeconds).toBe(0);
  });

  it.each([
    ["an HTTP error", jsonResponse({}, false, 500)],
    ["an error message", jsonResponse({ error: "No path" })],
    ["a status message", jsonResponse({ status_message: "Bad request" })],
    ["an empty reply", jsonResponse({})],
    ["an unknown stop", jsonResponse({ trip: { locations: [{ original_index: 9 }], legs: [], summary: {} } })],
    ["a broken path", jsonResponse({ trip: { locations: [{}, {}, {}], legs: [{ shape: "_" }], summary: {} } })],
  ])("falls back to a straight-line route on %s", async (_label, response) => {
    vi.stubGlobal("fetch", vi.fn(async () => response));

    const route = await calculateDeliveryRoute(depot, [near], "http://valhalla:8002");

    expect(route.source).toBe("approximate");
  });
});

describe("address lookup", () => {
  const sjsu = { geometry: { coordinates: [-121.88, 37.33] }, properties: { street: "Washington Square", housenumber: "1", city: "San Jose", postcode: "95192" } };

  it("returns the coordinates of the best match near the store", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ features: [sjsu] }));
    vi.stubGlobal("fetch", fetchMock);

    const location = await geocodeAddress({ street: "1 Washington Sq", city: "San Jose", state: "CA", zipCode: "95192" }, "http://photon");

    expect(location).toEqual({ latitude: 37.33, longitude: -121.88 });
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("q")).toBe("1 Washington Square, San Jose, CA 95192");
    expect(url.searchParams.get("lat")).toBe("37.3382");
  });

  it("ignores guesses that aren't on the typed street and in the typed city or ZIP", async () => {
    const guesses = [
      { geometry: { coordinates: [-121.88, 37.23] }, properties: { name: "Blvd Coffee", street: "Meridian Avenue", city: "San Jose", postcode: "95118" } },
      { geometry: { coordinates: [-121.9, 37.4] }, properties: { street: "Nowhere Boulevard", city: "Fresno", postcode: "93701" } },
    ];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => String(input).startsWith("http://photon")
      ? jsonResponse({ features: guesses })
      : jsonResponse({ result: { addressMatches: [] } })));
    await expect(geocodeAddress({ street: "99999 Nowhere Blvd", city: "San Jose", state: "CA", zipCode: "95112" }, "http://photon", "http://census")).resolves.toBeNull();
  });

  it("accepts a street-only match, an apartment number and a different street type spelling", async () => {
    const storyRoad = { geometry: { coordinates: [-121.86, 37.33] }, properties: { osm_key: "highway", name: "Story Road", city: "San Jose", postcode: "95116" } };
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ features: [storyRoad] })));
    await expect(geocodeAddress({ street: "174 Story Rd. Apt 4", city: "San Jose", state: "CA", zipCode: "95112" }, "http://photon")).resolves.toEqual({ latitude: 37.33, longitude: -121.86 });
  });

  it("returns nothing when the address isn't found", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ features: [] })));
    await expect(geocodeAddress({ street: "x", city: "y", state: "CA", zipCode: "0" }, "http://photon")).resolves.toBeNull();
  });

  it("reports a lookup service error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, false, 503)));
    await expect(geocodeAddress({ street: "x", city: "y", state: "CA", zipCode: "0" }, "http://photon")).rejects.toThrow("HTTP 503");
  });

  it("is used by dispatch when no lookup is passed in", async () => {
    vi.stubEnv("VALHALLA_URL", "");
    vi.stubEnv("PHOTON_URL", "http://photon");
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ features: [sjsu] })));
    const store: DeliveryStore = {
      listDeliveries: async () => [],
      listUnassignedPaidOrders: async () => [{
        orderId: "a", customerId: "c", addressId: "addr", totalWeight: 5, createdAt: new Date(),
        street: "1 Washington Sq", city: "San Jose", state: "CA", zipCode: "95192", latitude: null, longitude: null,
      }],
      listRobots: async () => [{
        robotId: "r1", robotName: "R1", status: "available", maximumOrders: 10, maximumWeight: 200,
        currentLatitude: 37.3382, currentLongitude: -121.8863, lastUpdated: new Date(),
      }],
      createDeliveryRun: async () => "run-1",
      saveAddressCoordinates: async () => true,
    };

    const result = await dispatchPendingOrders(store);

    expect(result.runs[0].orderIds).toEqual(["a"]);
  });
});

describe("address lookup backup", () => {
  const address = { street: "200 E Santa Clara St", city: "San Jose", state: "CA", zipCode: "95113" };

  it("asks the Census geocoder when Photon is down", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => String(input).startsWith("http://photon")
      ? Promise.reject(new TypeError("fetch failed"))
      : jsonResponse({ result: { addressMatches: [{ coordinates: { x: -121.8862, y: 37.3382 } }] } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(geocodeAddress(address, "http://photon", "http://census")).resolves.toEqual({ latitude: 37.3382, longitude: -121.8862 });
    const census = new URL(String(fetchMock.mock.calls[1][0]));
    expect(census.pathname).toBe("/geocoder/locations/onelineaddress");
    expect(census.searchParams.get("address")).toBe("200 E Santa Clara St, San Jose, CA 95113");
  });

  it("asks the Census geocoder when Photon can't find the address", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => String(input).startsWith("http://photon")
      ? jsonResponse({ features: [] })
      : jsonResponse({ result: { addressMatches: [{ coordinates: { x: -121.9, y: 37.3 } }] } })));
    await expect(geocodeAddress(address, "http://photon", "http://census")).resolves.toEqual({ latitude: 37.3, longitude: -121.9 });
  });

  it("reports an outage when both are down, so the order stays queued", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    await expect(geocodeAddress(address, "http://photon", "http://census")).rejects.toThrow("fetch failed");
  });

  it("reports an outage when Photon is down and Census doesn't know the address", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => String(input).startsWith("http://photon")
      ? Promise.reject(new TypeError("fetch failed"))
      : jsonResponse({ result: { addressMatches: [] } })));
    await expect(geocodeAddress(address, "http://photon", "http://census")).rejects.toThrow("fetch failed");
  });
});

describe("address suggestions", () => {
  const house = (properties: Record<string, string>) => ({ properties: { countrycode: "US", city: "San Jose", state: "California", postcode: "95112", ...properties } });

  function photon(houses: unknown[], streets: unknown[] = []) {
    const fetchMock = vi.fn(async (input: string | URL) =>
      jsonResponse({ features: new URL(String(input)).searchParams.get("layer") === "street" ? streets : houses }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("turns matching houses near the store into full addresses", async () => {
    const fetchMock = photon([
      house({ housenumber: "200", street: "East Santa Clara Street" }),
      house({ housenumber: "200", street: "East Santa Clara Street", name: "City Hall" }),
      house({ housenumber: "12", street: "Somewhere Road", countrycode: "CA" }),
    ]);

    const found = await suggestAddresses("200 E Santa Clara St", "http://photon-a");

    expect(found).toEqual([{ label: "200 East Santa Clara Street, San Jose, CA 95112", street: "200 East Santa Clara Street", city: "San Jose", state: "CA", zipCode: "95112" }]);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("q")).toBe("200 East Santa Clara Street");
    expect(url.searchParams.get("bbox")).toBe([-121.8863 - 0.75, 37.3382 - 0.75, -121.8863 + 0.75, 37.3382 + 0.75].join(","));
  });

  it("puts the typed house number on a matching street when the house isn't mapped", async () => {
    photon(
      [house({ housenumber: "769", street: "South 11th Street" })],
      [{ properties: { countrycode: "US", name: "Willow Street", city: "San Jose", state: "CA", postcode: "95125" } }],
    );

    const found = await suggestAddresses("769 Willow St", "http://photon-b");

    expect(found.map((s) => s.label)).toEqual(["769 Willow Street, San Jose, CA 95125"]);
  });

  it("leaves a trailing direction letter alone while it's still being typed", async () => {
    const fetchMock = photon([]);
    await suggestAddresses("10 N 1st S", "http://photon-c");
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("q")).toBe("10 North 1st S");
  });

  it("skips a bare house number and remembers recent answers", async () => {
    const fetchMock = photon([house({ housenumber: "5", street: "Story Road" })]);
    await expect(suggestAddresses("123", "http://photon-d")).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();

    await suggestAddresses("5 Story Rd", "http://photon-d");
    const calls = fetchMock.mock.calls.length;
    await suggestAddresses("5  story rd", "http://photon-d");
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it("reports a lookup service error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, false, 429)));
    await expect(suggestAddresses("1 Main St", "http://photon-e")).rejects.toThrow("HTTP 429");
  });
});

describe("robot base location", () => {
  it("uses the configured store location, or San Jose by default", () => {
    vi.stubEnv("ROBOT_BASE_LATITUDE", "");
    vi.stubEnv("ROBOT_BASE_LONGITUDE", "");
    expect(getRobotBaseLocation()).toEqual({ latitude: 37.3382, longitude: -121.8863 });

    configureRobotBaseLocation({ latitude: 40, longitude: -100 });
    expect(getRobotBaseLocation()).toEqual({ latitude: 40, longitude: -100 });
  });

  it("rejects an invalid configured location", () => {
    vi.stubEnv("ROBOT_BASE_LATITUDE", "200");
    expect(() => getRobotBaseLocation()).toThrow("ROBOT_BASE_LATITUDE");
  });

  it("treats a robot within about 15 meters as home", () => {
    const base = { latitude: 37.3382, longitude: -121.8863 };
    expect(isAtRobotBaseLocation(37.33825, -121.8863, base)).toBe(true);
    expect(isAtRobotBaseLocation(37.3392, -121.8863, base)).toBe(false);
    expect(isAtRobotBaseLocation(null, -121.8863, base)).toBe(false);
    expect(isAtRobotBaseLocation(Number.NaN, -121.8863, base)).toBe(false);
  });
});
