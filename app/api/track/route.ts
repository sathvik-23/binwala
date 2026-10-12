import { NextResponse } from "next/server";
import { z } from "zod";
import { store } from "@/lib/store";
import { clientIp, hashIp, rateLimit } from "@/lib/security";

export const runtime = "nodejs";

const ALLOWED = new Set([
  "page_view", "hero_cta_focus", "form_start", "signup_success", "signup_error",
  "share_whatsapp", "share_copy", "share_x", "share_native", "profile_saved",
  "map_select", "section_view", "faq_open", "join_open", "join_step", "join_location",
]);

const Body = z.object({
  name: z.string().max(40),
  props: z.record(z.string(), z.union([z.string().max(200), z.number(), z.boolean(), z.null()])).optional(),
  path: z.string().max(200).optional(),
  sid: z.string().max(64).optional(),
});

export async function POST(req: Request) {
  const raw = await req.text().catch(() => "");
  const parsed = Body.safeParse((() => { try { return JSON.parse(raw); } catch { return null; } })());
  if (!parsed.success || !ALLOWED.has(parsed.data.name)) return new NextResponse(null, { status: 204 });
  if (!rateLimit(`track:${hashIp(clientIp(req))}`, 120, 60_000)) return new NextResponse(null, { status: 204 });
  try {
    await store().track(parsed.data.name, parsed.data.props ?? {}, parsed.data.path ?? null, parsed.data.sid ?? null);
  } catch (e) {
    console.error("[track]", e);
  }
  return new NextResponse(null, { status: 204 });
}
