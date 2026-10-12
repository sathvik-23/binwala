import { NextResponse } from "next/server";
import { HSR_BOUNDS, HSR_CENTER, detectSector, inHsr, type Place, type PlaceKind } from "@/lib/hsr";
import { clientIp, hashIp, rateLimit } from "@/lib/security";

export const runtime = "nodejs";

/*
  /api/places?q=prestige&s=<session>           → building / street suggestions inside HSR
  /api/places?id=g:<placeId>&s=<session>        → resolve a Google suggestion to coordinates + full address
  /api/places?lat=..&lng=..                     → reverse geocode ("use my location")

  Uses Google Places (New) when GOOGLE_MAPS_API_KEY is set — best coverage of apartment and building
  names. Otherwise falls back to OpenStreetMap via Photon, which needs no key.
*/

const GOOGLE = process.env.GOOGLE_MAPS_API_KEY;
const UA = "binwala-waitlist/1.0 (+https://binwala.online)";

const cache = new Map<string, { at: number; data: unknown }>();
const TTL = 10 * 60_000;
function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.data as T);
  return fn().then((data) => {
    cache.set(key, { at: Date.now(), data });
    if (cache.size > 800) cache.delete(cache.keys().next().value!);
    return data;
  });
}

async function fetchJson(url: string, init: RequestInit = {}, ms = 2500) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal, headers: { "User-Agent": UA, ...(init.headers ?? {}) } });
    if (!r.ok) throw new Error(`${r.status} ${await r.text().catch(() => "")}`.slice(0, 300));
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

/* --------------------------------- Google -------------------------------- */

async function googleSearch(q: string, session: string): Promise<Place[]> {
  const data = await fetchJson("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE! },
    body: JSON.stringify({
      input: q,
      sessionToken: session || undefined,
      includedRegionCodes: ["in"],
      languageCode: "en",
      locationRestriction: {
        rectangle: {
          low: { latitude: HSR_BOUNDS.south, longitude: HSR_BOUNDS.west },
          high: { latitude: HSR_BOUNDS.north, longitude: HSR_BOUNDS.east },
        },
      },
    }),
  });
  type Pred = { placeId: string; types?: string[]; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } }; text?: { text: string } };
  return ((data.suggestions ?? []) as { placePrediction?: Pred }[])
    .map((s) => s.placePrediction)
    .filter((p): p is Pred => Boolean(p))
    .map((p) => {
      const types = p.types ?? [];
      const kind: PlaceKind = types.includes("route")
        ? "street"
        : types.some((t) => ["sublocality", "neighborhood", "locality", "sublocality_level_1", "sublocality_level_2"].includes(t))
          ? "area"
          : types.some((t) => ["establishment", "point_of_interest"].includes(t)) && !types.includes("premise")
            ? "landmark"
            : "building";
      const title = p.structuredFormat?.mainText?.text ?? p.text?.text ?? "";
      const subtitle = p.structuredFormat?.secondaryText?.text ?? "";
      return { id: `g:${p.placeId}`, title, subtitle, kind, source: "google" as const, sector: detectSector(`${title} ${subtitle}`) };
    });
}

async function googleDetails(placeId: string, session: string): Promise<Place> {
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}${session ? `?sessionToken=${encodeURIComponent(session)}` : ""}`;
  const d = await fetchJson(url, {
    headers: { "X-Goog-Api-Key": GOOGLE!, "X-Goog-FieldMask": "id,displayName,formattedAddress,location,types" },
  });
  const title = d.displayName?.text ?? "";
  const addr: string = d.formattedAddress ?? "";
  const subtitle = addr.startsWith(title) ? addr.slice(title.length).replace(/^,\s*/, "") : addr;
  return {
    id: `g:${placeId}`,
    title,
    subtitle,
    kind: "building",
    lat: d.location?.latitude,
    lng: d.location?.longitude,
    source: "google",
    sector: detectSector(addr),
  };
}

async function googleReverse(lat: number, lng: number): Promise<Place | null> {
  const d = await fetchJson(
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE}&language=en&result_type=premise|street_address|route`,
  );
  const r = d.results?.[0];
  if (!r) return null;
  const parts: string[] = r.formatted_address.split(", ");
  return {
    id: `g:${r.place_id}`,
    title: parts[0],
    subtitle: parts.slice(1).join(", "),
    kind: "building",
    lat,
    lng,
    source: "google",
    sector: detectSector(r.formatted_address),
  };
}

/* ------------------------------ OpenStreetMap ----------------------------- */

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | number | undefined>;
};

function fromPhoton(f: PhotonFeature): Place {
  const p = f.properties;
  const [lng, lat] = f.geometry.coordinates;
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  const name = String(p.name ?? street ?? "");
  const rest = [p.name ? street : null, p.district, p.locality, p.city ?? "Bengaluru", p.postcode].filter(
    (x, i, a) => x && a.indexOf(x) === i && x !== name,
  ) as string[];
  const key = String(p.osm_key ?? "");
  const kind: PlaceKind =
    key === "highway" ? "street" : key === "place" ? "area" : key === "building" || p.type === "house" ? "building" : "landmark";
  const subtitle = rest.join(", ");
  return {
    id: `osm:${p.osm_type}${p.osm_id}`,
    title: name,
    subtitle,
    kind,
    lat,
    lng,
    source: "osm",
    sector: detectSector(`${name} ${subtitle}`),
  };
}

async function osmSearch(q: string): Promise<Place[]> {
  const b = HSR_BOUNDS;
  const url =
    `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=10&lang=en` +
    `&bbox=${b.west},${b.south},${b.east},${b.north}&lat=${HSR_CENTER.lat}&lon=${HSR_CENTER.lng}`;
  const d = await fetchJson(url);
  const seen = new Set<string>();
  return ((d.features ?? []) as PhotonFeature[])
    .map(fromPhoton)
    .filter((p) => p.title && p.lat && p.lng && inHsr(p.lat, p.lng))
    .filter((p) => {
      const k = `${p.title}|${p.subtitle}`.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 7);
}

async function osmReverse(lat: number, lng: number): Promise<Place | null> {
  const d = await fetchJson(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&limit=1&lang=en`);
  const f = (d.features ?? [])[0] as PhotonFeature | undefined;
  if (!f) return null;
  return { ...fromPhoton(f), lat, lng };
}

/* --------------------------------- route --------------------------------- */

export async function GET(req: Request) {
  if (!rateLimit(`places:${hashIp(clientIp(req))}`, 90, 60_000)) {
    return NextResponse.json({ places: [], error: "slow down" }, { status: 429 });
  }
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").trim().slice(0, 80);
  const id = u.searchParams.get("id") ?? "";
  const session = (u.searchParams.get("s") ?? "").slice(0, 64);
  const lat = Number(u.searchParams.get("lat"));
  const lng = Number(u.searchParams.get("lng"));
  const headers = { "Cache-Control": "public, max-age=300, s-maxage=600" };

  try {
    if (id.startsWith("g:") && GOOGLE) {
      const place = await cached(`d:${id}`, () => googleDetails(id.slice(2), session));
      return NextResponse.json({ place }, { headers });
    }
    if (Number.isFinite(lat) && Number.isFinite(lng) && u.searchParams.has("lat")) {
      const r = await cached(`r:${lat.toFixed(4)},${lng.toFixed(4)}`, () => (GOOGLE ? googleReverse(lat, lng) : osmReverse(lat, lng)));
      return NextResponse.json({ place: r, inHsr: inHsr(lat, lng) });
    }
    if (q.length < 2) return NextResponse.json({ places: [] });
    const places = await cached(`q:${GOOGLE ? "g" : "o"}:${q.toLowerCase()}`, () => (GOOGLE ? googleSearch(q, session) : osmSearch(q)));
    return NextResponse.json({ places, provider: GOOGLE ? "google" : "osm" }, { headers });
  } catch (e) {
    console.error("[places]", (e as Error).message);
    return NextResponse.json({ places: [], place: null, error: "lookup failed" }, { status: 200 });
  }
}
