import { NextResponse, after } from "next/server";
import { z } from "zod";
import { store } from "@/lib/store";
import { AREA_IDS, OUTSIDE } from "@/lib/neighbourhoods";
import { SLOT_IDS, inHsr as pointInHsr, normalizePhone } from "@/lib/hsr";
import { clientIp, hashIp, rateLimit, sameOrigin } from "@/lib/security";
import { invalidateStats } from "@/lib/statsCache";
import { sendMail } from "@/lib/email/mailer";
import { teamAlert, welcomeEmail } from "@/lib/email/welcome";

export const runtime = "nodejs";

const Body = z.object({
  email: z.string().trim().max(254).email(),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(20),
  neighbourhood: z.string().refine((v) => AREA_IDS.has(v)),
  address: z.object({
    title: z.string().trim().min(2).max(160),
    line: z.string().trim().max(240).default(""),
    placeId: z.string().max(200).nullish(),
    lat: z.number().min(-90).max(90).nullish(),
    lng: z.number().min(-180).max(180).nullish(),
  }),
  flat: z.string().trim().max(60).nullish(),
  dumpsPerDay: z.number().int().min(1).max(4),
  pickupSlot: z.enum(SLOT_IDS),
  ref: z.string().trim().regex(/^[A-Z0-9]{4,12}$/).nullish().catch(null),
  utm: z.object({ source: z.string().max(80).nullish(), medium: z.string().max(80).nullish(), campaign: z.string().max(120).nullish() }).nullish(),
  company: z.string().optional(), // honeypot
});

const MESSAGES: Record<string, string> = {
  email: "That email doesn't look right.",
  name: "Tell us your name.",
  phone: "Enter a 10-digit mobile number.",
  neighbourhood: "Pick your HSR sector.",
  address: "Pick your building or street.",
  dumpsPerDay: "How many times a day do you throw out waste?",
  pickupSlot: "Pick a pickup time.",
};

function siteUrl(req: Request) {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : new URL(req.url).origin)
  );
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "");
    return NextResponse.json({ error: MESSAGES[field] ?? "Something's off with that form.", field }, { status: 422 });
  }
  const b = parsed.data;
  const phone = normalizePhone(b.phone);
  if (!phone) return NextResponse.json({ error: MESSAGES.phone, field: "phone" }, { status: 422 });

  if (b.company) {
    return NextResponse.json({ referralCode: "XXXXXXX", position: 0, neighbourhood: b.neighbourhood, neighbourhoodCount: 0, referrals: 0, alreadyJoined: false, name: b.name });
  }

  const ipHash = hashIp(clientIp(req));
  if (!rateLimit(`signup:${ipHash}`, 8, 10 * 60_000)) {
    return NextResponse.json({ error: "Easy there. Try again in a few minutes." }, { status: 429 });
  }

  const hasPoint = typeof b.address.lat === "number" && typeof b.address.lng === "number";
  const inHsr = b.neighbourhood !== OUTSIDE && (!hasPoint || pointInHsr(b.address.lat!, b.address.lng!));

  try {
    const result = await store().signup({
      email: b.email,
      name: b.name,
      phone,
      neighbourhood: b.neighbourhood,
      addressTitle: b.address.title,
      addressLine: b.address.line,
      placeId: b.address.placeId ?? null,
      lat: b.address.lat ?? null,
      lng: b.address.lng ?? null,
      inHsr,
      flat: b.flat || null,
      dumpsPerDay: b.dumpsPerDay,
      pickupSlot: b.pickupSlot,
      referredBy: b.ref ?? null,
      utmSource: b.utm?.source ?? null,
      utmMedium: b.utm?.medium ?? null,
      utmCampaign: b.utm?.campaign ?? null,
      ipHash,
      userAgent: req.headers.get("user-agent"),
    });

    if (!result.alreadyJoined) {
      invalidateStats();
      const data = {
        name: b.name,
        email: b.email,
        phone,
        position: result.position,
        referralCode: result.referralCode,
        neighbourhood: b.neighbourhood,
        addressTitle: b.address.title,
        addressLine: b.address.line,
        flat: b.flat,
        dumpsPerDay: b.dumpsPerDay,
        pickupSlot: b.pickupSlot,
        siteUrl: siteUrl(req),
      };
      // Runs after the response is sent, so the celebration screen never waits on email.
      after(async () => {
        try {
          const status = await sendMail({ to: b.email, ...welcomeEmail(data) });
          await store().markEmail(result.referralCode, status);
        } catch (e) {
          console.error("[mail] welcome failed", e);
          await store().markEmail(result.referralCode, "failed").catch(() => {});
        }
        if (process.env.MAIL_NOTIFY_TO) {
          await sendMail({ to: process.env.MAIL_NOTIFY_TO, ...teamAlert(data) }).catch((e) => console.error("[mail] team alert failed", e));
        }
      });
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error("[waitlist] signup failed", e);
    return NextResponse.json({ error: "We couldn't save that just now. Try again?" }, { status: 500 });
  }
}
