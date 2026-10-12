import "server-only";
import { store, type Stats } from "@/lib/store";

const g = globalThis as unknown as { __binwalaStats?: { at: number; data: Stats } | null };

export async function getStats(maxAgeMs = 15_000): Promise<Stats> {
  const c = g.__binwalaStats;
  if (c && Date.now() - c.at < maxAgeMs) return c.data;
  const data = await store().stats();
  g.__binwalaStats = { at: Date.now(), data };
  return data;
}

export function invalidateStats() {
  g.__binwalaStats = null;
}
