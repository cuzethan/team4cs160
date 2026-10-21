import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Map, { Layer, Marker, NavigationControl, Source } from "react-map-gl/maplibre";
import { SiteHeader } from "../components/SiteHeader";
import { fetchOrderTracking, type CustomerTracking } from "./api";

const mapStyle = "https://tiles.openfreemap.org/styles/liberty";

export function OrderTrackingPage() {
  const { orderId = "" } = useParams();
  const [tracking, setTracking] = useState<CustomerTracking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (initial = false) => {
    try {
      const next = await fetchOrderTracking(orderId);
      setTracking(next);
      setError(null);
    } catch (fetchError) {
      setError((fetchError as Error).message);
    } finally {
      if (initial) setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    setLoading(true);
    void refresh(true);
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const route = useMemo(() => tracking?.routeGeometry?.length
    ? {
        type: "Feature" as const,
        properties: {},
        geometry: { type: "LineString" as const, coordinates: tracking.routeGeometry },
      }
    : null, [tracking?.routeGeometry]);

  const position = tracking?.robotLatitude != null && tracking.robotLongitude != null
    ? { latitude: tracking.robotLatitude, longitude: tracking.robotLongitude }
    : null;
  const firstPoint = tracking?.routeGeometry?.[0];
  const center = position
    ? { latitude: position.latitude, longitude: position.longitude }
    : firstPoint
      ? { latitude: firstPoint[1], longitude: firstPoint[0] }
      : { latitude: 37.3382, longitude: -121.8863 };

  return (
    <div className="min-h-screen bg-[#fbfaf5] text-[#253b2d]">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
        <Link to="/orders" className="text-sm font-bold text-[#416449] underline">← Order history</Link>
        <div className="mt-5 mb-6">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#7d887b]">Live delivery</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#294332] sm:text-4xl">Track order #{orderId.slice(0, 8).toUpperCase()}</h1>
        </div>

        {loading ? (
          <p role="status" className="rounded-2xl bg-white p-6 text-[#5f6b61]">Loading delivery details…</p>
        ) : error ? (
          <section role="alert" className="rounded-2xl border border-red-200 bg-white p-6">
            <p className="text-red-800">{error}</p>
            <button type="button" onClick={() => { setLoading(true); void refresh(true); }} className="mt-4 font-bold text-[#416449] underline">Try again</button>
          </section>
        ) : tracking && (
          <>
            <section className="mb-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-[#e8e7dc] bg-white p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-[#7d887b]">Delivery status</p>
                <p className="mt-2 text-lg font-extrabold capitalize text-[#294332]">{(tracking.deliveryStatus ?? tracking.orderStatus).replaceAll("_", " ")}</p>
              </div>
              <div className="rounded-2xl border border-[#e8e7dc] bg-white p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-[#7d887b]">Estimated arrival</p>
                <p className="mt-2 text-lg font-extrabold text-[#294332]">{tracking.eta ? new Date(tracking.eta).toLocaleString() : "Updating…"}</p>
              </div>
              <div className="rounded-2xl border border-[#e8e7dc] bg-white p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-[#7d887b]">Robot</p>
                <p className="mt-2 text-lg font-extrabold text-[#294332]">{tracking.robotName ?? "Awaiting assignment"}</p>
                {tracking.stopNumber != null && <p className="mt-1 text-sm text-[#667269]">Stop {tracking.stopNumber}</p>}
              </div>
            </section>
            {tracking.deliveryStatus === "delivered" && (
              <p role="status" className="mb-5 rounded-2xl bg-[#e9f1df] px-6 py-4 font-semibold text-[#416449]">Your robot has arrived. You can confirm receipt from your order history.</p>
            )}
            <div className="h-[55vh] min-h-[360px] overflow-hidden rounded-2xl border border-[#e8e7dc] bg-white shadow-sm">
              <Map
                initialViewState={{ ...center, zoom: 13 }}
                mapStyle={mapStyle}
                style={{ width: "100%", height: "100%" }}
              >
                <NavigationControl position="top-right" />
                {route && <Source id="delivery-route" type="geojson" data={route}>
                  <Layer id="delivery-route-line" type="line" paint={{ "line-color": "#416449", "line-width": 5, "line-opacity": 0.8 }} />
                </Source>}
                {position && <Marker latitude={position.latitude} longitude={position.longitude} anchor="center">
                  <div aria-label={`${tracking.robotName ?? "Robot"} location`} title={tracking.robotName ?? "Delivery robot"} className="flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-white bg-[#416449] text-lg shadow-lg">🤖</div>
                </Marker>}
              </Map>
            </div>
            <p className="mt-3 text-xs text-[#7d887b]">Location refreshes every few seconds{tracking.routeSource === "approximate" ? ". The displayed route is an estimated fallback." : "."}</p>
          </>
        )}
      </main>
    </div>
  );
}
