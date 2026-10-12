// Tiny shared state between the DOM (scroll, form) and the WebGL city.
// Mutated directly — the scene reads it every frame, no React re-renders.

export type ScreenPoint = { id: string; x: number; y: number; depth: number; onScreen: boolean };

export const bus = {
  /** which transparent section currently owns the canvas */
  mode: "hero" as "hero" | "network" | "finale" | "signup" | "hidden",
  /** live state of the join flow: the city follows along */
  signup: {
    active: false,
    pin: null as null | { lat: number; lng: number },
    slot: null as null | string,
    dumps: 0,
  },
  heroProgress: 0, // 0 → hero top, 1 → hero scrolled away
  networkProgress: 0, // 0 → network enters, 1 → leaves
  finaleProgress: 0,
  pointer: { x: 0, y: 0 }, // -1..1
  counts: new Map<string, number>(),
  countsVersion: 0,
  highlight: null as string | null,
  pulse: null as { id: string; at: number } | null,
  ready: false,
  listeners: new Set<(pts: ScreenPoint[]) => void>(),
  readyListeners: new Set<() => void>(),
};

export function setCounts(list: { id: string; count: number }[]) {
  bus.counts = new Map(list.map((n) => [n.id, n.count]));
  bus.countsVersion++;
}

export function pulseNeighbourhood(id: string) {
  bus.pulse = { id, at: performance.now() };
}
