// Binwala launches in HSR Layout first. Signups are tagged by HSR sector so the
// waitlist shows which streets and apartment clusters to start with.

export type Area = { id: string; name: string; short: string };

export const LAUNCH = {
  name: "HSR Layout",
  city: "Bengaluru",
  lat: 12.9116,
  lng: 77.6474,
};

export const SECTORS: Area[] = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
  id: `hsr-sector-${n}`,
  name: `Sector ${n}`,
  short: `S${n}`,
}));

export const HSR_UNSURE = "hsr-unsure";
export const OUTSIDE = "outside";

export const AREAS: Area[] = [
  ...SECTORS,
  { id: HSR_UNSURE, name: "HSR, not sure of sector", short: "HSR" },
  { id: OUTSIDE, name: "I'm not in HSR Layout", short: "—" },
];

export const AREA_IDS = new Set(AREAS.map((a) => a.id));
export const isHsr = (id: string) => id !== OUTSIDE;

export function areaName(id: string) {
  return AREAS.find((a) => a.id === id)?.name ?? id;
}

/** "HSR Layout · Sector 2", or just "HSR Layout" */
export function areaLabel(id: string) {
  if (id === OUTSIDE) return "Not in HSR yet";
  if (id === HSR_UNSURE) return LAUNCH.name;
  const s = SECTORS.find((x) => x.id === id);
  return s ? `${LAUNCH.name} · ${s.name}` : id;
}

export const RESIDENT_TYPES = [
  { id: "apartment", label: "Apartment community" },
  { id: "independent", label: "Independent house" },
  { id: "pg-rental", label: "PG / rental" },
  { id: "business", label: "Business / café / office" },
] as const;

export const PAIN_POINTS = [
  { id: "missed", label: "Missed or irregular pickups" },
  { id: "segregation", label: "Unsure how to segregate" },
  { id: "ewaste", label: "Nowhere to drop e-waste" },
  { id: "bulk", label: "Bulky / renovation waste" },
  { id: "trace", label: "Don't know where it ends up" },
  { id: "smell", label: "Overflowing bins, smell" },
] as const;
