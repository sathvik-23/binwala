import { store } from "@/lib/store";
import { isAdmin } from "@/lib/admin";
import { areaName } from "@/lib/neighbourhoods";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const esc = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.join("|") : String(v);
  // Neutralise spreadsheet formula injection
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? req.headers.get("x-admin-token");
  if (!isAdmin(token)) return new Response("Unauthorized", { status: 401 });

  const rows = await store().exportRows();
  const cols = [
    "id", "created_at", "name", "email", "phone", "area_name", "neighbourhood", "flat", "address_title", "address_line",
    "lat", "lng", "in_hsr", "dumps_per_day", "pickup_slot", "referral_code", "referred_by", "utm_source", "utm_medium",
    "utm_campaign", "email_status",
  ] as const;
  const lines = [cols.join(",")];
  for (const r of rows) {
    const rec: Record<string, unknown> = { ...r, area_name: areaName(r.neighbourhood) };
    lines.push(cols.map((c) => esc(rec[c])).join(","));
  }
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="binwala-waitlist-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
