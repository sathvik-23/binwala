import { NextResponse } from "next/server";
import type { Stats } from "@/lib/store";
import { getStats } from "@/lib/statsCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getStats(), {
      headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" },
    });
  } catch (e) {
    console.error("[stats]", e);
    return NextResponse.json({ total: 0, neighbourhoods: [], recent: [] } satisfies Stats);
  }
}
