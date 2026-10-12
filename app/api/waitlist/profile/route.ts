import { NextResponse } from "next/server";
import { z } from "zod";
import { store } from "@/lib/store";
import { PAIN_POINTS, RESIDENT_TYPES } from "@/lib/neighbourhoods";
import { clientIp, hashIp, rateLimit, sameOrigin } from "@/lib/security";

export const runtime = "nodejs";

const residentIds = RESIDENT_TYPES.map((r) => r.id) as [string, ...string[]];
const painIds = PAIN_POINTS.map((p) => p.id) as [string, ...string[]];

const Body = z.object({
  code: z.string().regex(/^[A-Z0-9]{4,12}$/),
  email: z.string().trim().email().max(254),
  residentType: z.enum(residentIds).optional().nullable(),
  community: z.string().trim().max(120).optional().nullable(),
  householdSize: z.number().int().min(1).max(50).optional().nullable(),
  painPoints: z.array(z.enum(painIds)).max(painIds.length).optional().nullable(),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  if (!rateLimit(`profile:${hashIp(clientIp(req))}`, 20, 10 * 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid details" }, { status: 422 });
  const { code, email, ...p } = parsed.data;
  try {
    const ok = await store().updateProfile(code, email, { ...p, community: p.community || null });
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    console.error("[waitlist] profile failed", e);
    return NextResponse.json({ error: "Couldn't save" }, { status: 500 });
  }
}
