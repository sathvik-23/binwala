import { NextResponse } from "next/server";
import { z } from "zod";
import { store } from "@/lib/store";
import { AREA_IDS } from "@/lib/neighbourhoods";
import { clientIp, hashIp, rateLimit, sameOrigin } from "@/lib/security";
import { invalidateStats } from "@/lib/statsCache";

export const runtime = "nodejs";

const Body = z.object({
  email: z.string().trim().max(254).email(),
  neighbourhood: z.string().refine((v) => AREA_IDS.has(v), "Pick your sector"),
  neighbourhoodOther: z.string().trim().max(80).optional().nullable(),
  ref: z.string().trim().regex(/^[A-Z0-9]{4,12}$/).optional().nullable().catch(null),
  utm: z
    .object({
      source: z.string().max(80).optional().nullable(),
      medium: z.string().max(80).optional().nullable(),
      campaign: z.string().max(120).optional().nullable(),
    })
    .optional()
    .nullable(),
  company: z.string().optional(), // honeypot
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    const msg = field === "email" ? "That email doesn't look right." : field === "neighbourhood" ? "Pick your HSR sector." : "Something's off with that form.";
    return NextResponse.json({ error: msg, field }, { status: 422 });
  }
  const b = parsed.data;

  // Honeypot: pretend success, store nothing.
  if (b.company) {
    return NextResponse.json({ referralCode: "XXXXXXX", position: 0, neighbourhood: b.neighbourhood, neighbourhoodCount: 0, referrals: 0, alreadyJoined: false });
  }

  const ipHash = hashIp(clientIp(req));
  if (!rateLimit(`signup:${ipHash}`, 8, 10 * 60_000)) {
    return NextResponse.json({ error: "Easy there — try again in a few minutes." }, { status: 429 });
  }

  try {
    const result = await store().signup({
      email: b.email,
      neighbourhood: b.neighbourhood,
      neighbourhoodOther: null,
      referredBy: b.ref ?? null,
      utmSource: b.utm?.source ?? null,
      utmMedium: b.utm?.medium ?? null,
      utmCampaign: b.utm?.campaign ?? null,
      ipHash,
      userAgent: req.headers.get("user-agent"),
    });
    if (!result.alreadyJoined) invalidateStats();
    return NextResponse.json(result);
  } catch (e) {
    console.error("[waitlist] signup failed", e);
    return NextResponse.json({ error: "We couldn't save that just now. Try again?" }, { status: 500 });
  }
}
