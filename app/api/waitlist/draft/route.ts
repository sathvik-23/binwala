import { NextResponse } from "next/server";
import { z } from "zod";
import { store } from "@/lib/store";
import { normalizePhone } from "@/lib/hsr";
import { clientIp, hashIp, rateLimit, sameOrigin } from "@/lib/security";

export const runtime = "nodejs";

// Saves progress after each step, so people who start but don't finish still show up (admin → "abandoned").
const Body = z.object({
  email: z.string().trim().email().max(254),
  name: z.string().trim().max(80).nullish(),
  phone: z.string().trim().max(20).nullish(),
  step: z.number().int().min(1).max(10),
  data: z.record(z.string(), z.union([z.string().max(240), z.number(), z.boolean(), z.null()])).optional(),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new NextResponse(null, { status: 403 });
  if (!rateLimit(`draft:${hashIp(clientIp(req))}`, 60, 10 * 60_000)) return new NextResponse(null, { status: 204 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return new NextResponse(null, { status: 204 });
  try {
    await store().saveDraft({ ...p.data, phone: p.data.phone ? normalizePhone(p.data.phone) : null });
  } catch (e) {
    console.error("[draft]", e);
  }
  return new NextResponse(null, { status: 204 });
}
