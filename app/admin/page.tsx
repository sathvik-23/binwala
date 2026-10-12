import { store } from "@/lib/store";
import { isAdmin } from "@/lib/admin";
import { areaName, PAIN_POINTS, RESIDENT_TYPES } from "@/lib/neighbourhoods";
import { fmt } from "@/lib/format";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Binwala · Waitlist admin", robots: { index: false, follow: false } };

const label = (list: readonly { id: string; label: string }[], id: string) => list.find((x) => x.id === id)?.label ?? id;

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

export default async function Admin({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!isAdmin(token)) {
    return (
      <main className="adm adm--locked">
        <h1 className="h3">Admin</h1>
        <p className="mono">Open /admin?token=YOUR_ADMIN_TOKEN (set ADMIN_TOKEN in your environment).</p>
      </main>
    );
  }
  const d = await store().admin();
  const max = Math.max(1, ...d.daily.map((x) => x.count));
  return (
    <main className="adm">
      <header className="adm-head">
        <div>
          <span className="mono tag tag--lime">BINWALA · DEMAND MAP</span>
          <h1 className="h2">Waitlist</h1>
        </div>
        <a className="btn btn--lime" href={`/api/admin/export?token=${encodeURIComponent(token!)}`}>
          Export CSV ↓
        </a>
      </header>

      <section className="adm-kpis">
        {[
          ["Total signups", d.total],
          ["Last 24 hours", d.today],
          ["Last 7 days", d.week],
          ["Sectors with signups", d.byNeighbourhood.filter((n) => n.id.startsWith("hsr-sector")).length],
        ].map(([k, v]) => (
          <div className="adm-kpi glass" key={k as string}>
            <span className="mono">{k}</span>
            <b>{fmt(v as number)}</b>
          </div>
        ))}
      </section>

      <section className="adm-card glass">
        <h2 className="h4">Signups, last 30 days</h2>
        <div className="adm-spark">
          {d.daily.map((x) => (
            <span key={x.day} title={`${x.day}: ${x.count}`} style={{ height: `${(x.count / max) * 100}%` }} />
          ))}
        </div>
      </section>

      <div className="adm-grid">
        <section className="adm-card glass">
          <h2 className="h4">Demand by HSR sector</h2>
          <Bars rows={d.byNeighbourhood.map((n) => ({ name: areaName(n.id), count: n.count, sub: n.referred ? `(${n.referred} ref)` : "" }))} />
        </section>
        <section className="adm-card glass">
          <h2 className="h4">Top apartment communities</h2>
          <Bars rows={d.topCommunities.map((c) => ({ name: `${c.community} · ${areaName(c.neighbourhood)}`, count: c.count }))} />
        </section>
        <section className="adm-card glass">
          <h2 className="h4">Resident type</h2>
          <Bars rows={d.byResidentType.map((r) => ({ name: r.id === "unknown" ? "Not answered" : label(RESIDENT_TYPES, r.id), count: r.count }))} />
        </section>
        <section className="adm-card glass">
          <h2 className="h4">Pain points</h2>
          <Bars rows={d.byPainPoint.map((r) => ({ name: label(PAIN_POINTS, r.id), count: r.count }))} />
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
