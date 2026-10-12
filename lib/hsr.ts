// HSR Layout geography + the signup choices.
// Shared by the client (instant local search) and the server (validation, geocoder filtering).

export const HSR_CENTER = { lat: 12.9121, lng: 77.6446 };

/** Generous box around HSR Layout and the localities inside it. Used to restrict geocoders and flag non-HSR picks. */
export const HSR_BOUNDS = { south: 12.893, west: 77.622, north: 12.932, east: 77.668 };

export const HSR_PIN = "560102";

export function inHsr(lat: number, lng: number) {
  return lat >= HSR_BOUNDS.south && lat <= HSR_BOUNDS.north && lng >= HSR_BOUNDS.west && lng <= HSR_BOUNDS.east;
}

export type PlaceKind = "building" | "street" | "area" | "landmark";

export type Place = {
  id: string; // "local:..." | "g:<placeId>" | "osm:<type><id>"
  title: string; // what the person typed toward, e.g. "Prestige Ferns Residency"
  subtitle: string; // the rest of the address
  kind: PlaceKind;
  lat?: number;
  lng?: number;
  source: "local" | "google" | "osm";
  sector?: string | null; // hsr-sector-N when we can tell
};

const ord = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const SECTOR_IDS = [1, 2, 3, 4, 5, 6, 7];

/** Everything here resolves instantly, before any network call. */
export const LOCAL_PLACES: Place[] = [
  ...SECTOR_IDS.map<Place>((n) => ({
    id: `local:sector-${n}`,
    title: `HSR Layout Sector ${n}`,
    subtitle: `Bengaluru ${HSR_PIN}`,
    kind: "area",
    source: "local",
    sector: `hsr-sector-${n}`,
  })),
  ...Array.from({ length: 27 }, (_, i) => i + 1).map<Place>((n) => ({
    id: `local:main-${n}`,
    title: `${ord(n)} Main Road`,
    subtitle: `HSR Layout, Bengaluru ${HSR_PIN}`,
    kind: "street",
    source: "local",
  })),
  ...Array.from({ length: 24 }, (_, i) => i + 1).map<Place>((n) => ({
    id: `local:cross-${n}`,
    title: `${ord(n)} Cross Road`,
    subtitle: `HSR Layout, Bengaluru ${HSR_PIN}`,
    kind: "street",
    source: "local",
  })),
  ...[
    ["Agara Main Road", "street"],
    ["Haralur Road", "street"],
    ["Hosur Road (HSR stretch)", "street"],
    ["Outer Ring Road (HSR stretch)", "street"],
    ["Somasundarapalya Main Road", "street"],
    ["Mangammanapalya Main Road", "street"],
    ["Parangipalya", "area"],
    ["Somasundarapalya", "area"],
    ["Mangammanapalya", "area"],
    ["Agara", "area"],
    ["Vanganahalli", "area"],
    ["BDA Complex, HSR Layout", "landmark"],
    ["NIFT Bengaluru", "landmark"],
    ["Agara Lake", "landmark"],
  ].map<Place>(([t, k]) => ({
    id: `local:${t.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    title: t,
    subtitle: `HSR Layout, Bengaluru ${HSR_PIN}`,
    kind: k as PlaceKind,
    source: "local",
  })),
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/(\d+)(st|nd|rd|th)\b/g, "$1")
    .replace(/\bmain\b|\bmn\b/g, "main")
    .replace(/\bcross\b|\bcrs\b/g, "cross")
    .replace(/\bsec(tor)?\b/g, "sector")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Tiny ranked prefix/contains search over LOCAL_PLACES. Runs per keystroke in well under 1 ms. */
export function searchLocal(q: string, limit = 5): Place[] {
  const nq = norm(q);
  if (!nq) return [];
  const terms = nq.split(" ");
  const scored: { p: Place; s: number }[] = [];
  for (const p of LOCAL_PLACES) {
    const hay = norm(`${p.title} ${p.subtitle}`);
    if (!terms.every((t) => hay.includes(t))) continue;
    const title = norm(p.title);
    let s = 0;
    if (title.startsWith(nq)) s += 10;
    if (title === nq) s += 10;
    if (p.kind === "area") s += 1;
    s -= title.length / 100;
    scored.push({ p, s });
  }
  return scored
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.p);
}

/** Pull "Sector 4" (or "4th Sector") out of any address string. */
export function detectSector(text: string): string | null {
  const m = text.match(/sector\s*[-:]?\s*([1-7])\b/i) ?? text.match(/\b([1-7])(?:st|nd|rd|th)?\s*sector\b/i);
  return m ? `hsr-sector-${m[1]}` : null;
}

/* ---------------------------- signup choices ---------------------------- */

export const DUMP_OPTIONS = [
  { id: 1, label: "Once", hint: "One bag a day" },
  { id: 2, label: "Twice", hint: "Morning + night" },
  { id: 3, label: "3 times", hint: "Busy kitchen" },
  { id: 4, label: "4+", hint: "Big family / PG" },
] as const;

export const SLOTS = [
  { id: "morning", label: "Morning", time: "6 – 11 AM", hue: "dawn" },
  { id: "afternoon", label: "Afternoon", time: "11 AM – 4 PM", hue: "noon" },
  { id: "evening", label: "Evening", time: "4 – 9 PM", hue: "dusk" },
  { id: "midnight", label: "Midnight", time: "9 PM – 2 AM", hue: "night" },
] as const;

export type SlotId = (typeof SLOTS)[number]["id"];
export const SLOT_IDS = SLOTS.map((s) => s.id) as [SlotId, ...SlotId[]];
export const slotLabel = (id: string | null | undefined) => {
  const s = SLOTS.find((x) => x.id === id);
  return s ? `${s.label} · ${s.time}` : "—";
};

/** Indian mobile numbers: 10 digits starting 6–9, with or without +91 / 0. Returns +91XXXXXXXXXX or null. */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
}

export const formatPhone = (e164: string) => {
  const d = e164.replace(/^\+91/, "");
  return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
};
