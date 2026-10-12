import { store } from "@/lib/store";
import { isAdmin } from "@/lib/admin";
import { areaName } from "@/lib/neighbourhoods";
import { HSR_BOUNDS, SLOTS } from "@/lib/hsr";
import { fmt } from "@/lib/format";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Binwala · Waitlist admin", robots: { index: false, follow: false } };

const SLOT_COLOR: Record<string, string> = { morning: "#ffd36b", afternoon: "#c8ff2e", evening: "#ff9a52", midnight: "#8fe3ff" };
const STEP_NAMES = ["", "Email", "Name", "Phone", "Address", "Bins a day", "Pickup time"];

function Bars({ rows }: { rows: { name: string; count: number; sub?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (!rows.length) return <p className="adm-empty mono">No data yet</p>;
  return (
    <ul className="adm-bars">
      {rows.map((r) => (
        <li key={r.name}>
          <span className="adm-bars-name">{r.name}</span>
          <span className="adm-bars-track">
            <span style={{ width: `${(r.count / max) * 100}%` }} />
          </span>
          <span className="adm-bars-v mono">
            {fmt(r.count)}
            {r.sub ? <small> {r.sub}</small> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function PinMap({ pins }: { pins: { lat: number; lng: number; slot: string | null }[] }) {
  const b = HSR_BOUNDS;
  const W = 600;
  const H = Math.round((W * (b.north - b.south)) / (b.east - b.west));
  const x = (lng: number) => ((lng - b.west) / (b.east - b.west)) * W;
  const y = (lat: number) => ((b.north - lat) / (b.north - b.south)) * H;
  return (
    <div className="adm-map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Signup locations across HSR Layout">
        <defs>
          <pattern id="g" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M30 0H0V30" fill="none" stroke="rgba(255,255,255,0.05)" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#g)" />
        {pins.map((p, i) => (
          <g key={i} transform={`translate(${x(p.lng).toFixed(1)} ${y(p.lat).toFixed(1)})`}>
            <circle r="9" fill={SLOT_COLOR[p.slot ?? ""] ?? "#c8ff2e"} opacity="0.12" />
            <circle r="3" fill={SLOT_COLOR[p.slot ?? ""] ?? "#c8ff2e"} />
          </g>
        ))}
      </svg>
      <div className="adm-legend mono">
        {SLOTS.map((s) => (
          <span key={s.id}>
            <i style={{ background: SLOT_COLOR[s.id] }} /> {s.label}
          </span>
        ))}
        <span>{fmt(pins.length)} mapped</span>
      </div>
    </div>
  );
}

export default async function Admin({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!isAdmin(token)) {
    return (
      <main className="adm adm--locked">
        <h1 className="h3">Admin</h1>
        <p className="mono">Open /admin?token=YOUR_ADMIN_TOKEN</p>
      </main>
    );
  }
  const d = await store().admin();
  const max = Math.max(1, ...d.daily.map((x) => x.count));
  const slotName = (id: string) => SLOTS.find((s) => s.id === id)?.label ?? "Not answered";
  return (
    <main className="adm">
      <header className="adm-head">
        <div>
          <span className="mono tag tag--lime">BINWALA · HSR DEMAND MAP</span>
          <h1 className="h2">Waitlist</h1>
        </div>
        <a className="btn btn--lime" href={`/api/admin/export?token=${encodeURIComponent(token!)}`}>
          Export CSV ↓
        </a>
      </header>

      <section className="adm-kpis">
        {(
          [
            ["Signups", fmt(d.total)],
            ["Last 24 hours", fmt(d.today)],
            ["Avg bin runs / day", d.avgDumps ?? "–"],
            ["Started, didn't finish", fmt(d.drafts.abandoned)],
            ["Welcome emails sent", fmt(d.emails.sent)],
            ["Email failures", fmt(d.emails.failed)],
          ] as [string, string | number][]
        ).map(([k, v]) => (
          <div className="adm-kpi glass" key={k}>
            <span className="mono">{k}</span>
            <b>{v}</b>
          </div>
        ))}
      </section>

      <div className="adm-grid">
        <section className="adm-card glass">
          <h2 className="h4">Where signups are</h2>
          <PinMap pins={d.pins} />
        </section>
        <section className="adm-card glass">
          <h2 className="h4">Signups, last 30 days</h2>
          <div className="adm-spark">
            {d.daily.map((x) => (
              <span key={x.day} title={`${x.day}: ${x.count}`} style={{ height: `${(x.count / max) * 100}%` }} />
            ))}
          </div>
          <h2 className="h4" style={{ marginTop: 28 }}>
            Preferred pickup time
          </h2>
          <Bars rows={d.bySlot.map((r) => ({ name: slotName(r.id), count: r.count }))} />
        </section>
        <section className="adm-card glass">
          <h2 className="h4">Demand by HSR sector</h2>
          <Bars rows={d.byNeighbourhood.map((n) => ({ name: areaName(n.id), count: n.count, sub: n.referred ? `(${n.referred} ref)` : "" }))} />
        </section>
        <section className="adm-card glass">
          <h2 className="h4">Bin runs a day</h2>
          <Bars rows={d.byDumps.map((r) => ({ name: r.id === "4" ? "4 or more" : r.id === "unknown" ? "Not answered" : `${r.id}×`, count: r.count }))} />
        </section>
        <section className="adm-card glass">
          <h2 className="h4">Top buildings</h2>
          <Bars rows={d.topBuildings.map((r) => ({ name: r.building, count: r.count }))} />
        </section>
        <section className="adm-card glass">
          <h2 className="h4">Where people drop off (unfinished signups)</h2>
          <Bars rows={d.drafts.byStep.map((r) => ({ name: `Stopped after: ${STEP_NAMES[r.step] ?? r.step}`, count: r.count }))} />
        </section>
        <section className="adm-card glass">
          <h2 className="h4">Sources</h2>
          <Bars rows={d.bySource.map((r) => ({ name: r.source, count: r.count }))} />
        </section>
        <section className="adm-card glass">
          <h2 className="h4">Top referrers</h2>
          <Bars rows={d.topReferrers.map((r) => ({ name: `${r.code} · ${areaName(r.neighbourhood)}`, count: r.referrals }))} />
        </section>
        <section className="adm-card glass">
          <h2 className="h4">Funnel (unique sessions, 30d)</h2>
          <Bars rows={d.funnel.map((r) => ({ name: r.name, count: r.count }))} />
        </section>
      </div>
    </main>
  );
}
