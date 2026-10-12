"use client";

import { useEffect, useMemo, useRef } from "react";
import { bus } from "@/lib/city/bus";
import { OUTSIDE, SECTORS } from "@/lib/neighbourhoods";
import { useWaitlist } from "./WaitlistContext";
import { fmt } from "@/lib/format";
import { track } from "@/lib/track";

export default function Network() {
  const { stats, goToSignup, neighbourhood } = useWaitlist();
  const label = useRef<HTMLButtonElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const counts = useMemo(() => new Map(stats.neighbourhoods.map((n) => [n.id, n.count])), [stats]);
  const hsrCount = stats.neighbourhoods.filter((n) => n.id !== OUTSIDE).reduce((a, n) => a + n.count, 0);
  const max = Math.max(1, ...SECTORS.map((s) => counts.get(s.id) ?? 0));

  useEffect(() => {
    const fn = (pts: { id: string; x: number; y: number; onScreen: boolean }[]) => {
      const show = bus.mode === "network" ? Math.max(0, Math.min(1, (bus.networkProgress - 0.75) / 0.15)) : 0;
      if (layer.current) layer.current.style.opacity = String(show);
      const p = pts[0];
      if (!p || !label.current || show <= 0) return;
      label.current.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
      label.current.style.visibility = p.onScreen ? "visible" : "hidden";
    };
    bus.listeners.add(fn);
    return () => {
      bus.listeners.delete(fn);
    };
  }, []);

  const select = (id?: string) => {
    track("map_select", { neighbourhood: id ?? "" });
    goToSignup(id);
  };

  return (
    <section className="network" id="network" data-city="network">
      <div className="network-sticky">
        <div className="network-labels" ref={layer} aria-hidden="true">
          <button ref={label} tabIndex={-1} className="nlabel nlabel--hsr" onClick={() => select()}>
            <span className="nlabel-dot" />
            <span className="nlabel-name">HSR Layout</span>
            <span className="nlabel-count mono">{hsrCount > 0 ? `${fmt(hsrCount)} IN` : "LAUNCH ZONE"}</span>
          </button>
        </div>

        <div className="network-panel glass" data-reveal>
          <div className="section-label mono">
            <span>04</span> / LAUNCH ZONE
          </div>
          <h2 className="h2 network-h">
            Starting in <span className="text-lime">HSR Layout.</span>
          </h2>
          <p className="lead">
            One neighbourhood, done properly. Your signup tells us which sectors and apartment communities get routes first.
          </p>

          <ol className="board" aria-label="Signups by HSR sector">
            {SECTORS.map((s) => {
              const c = counts.get(s.id) ?? 0;
              return (
                <li key={s.id}>
                  <button className={`board-row ${neighbourhood === s.id ? "is-mine" : ""}`} onClick={() => select(s.id)}>
                    <span className="board-rank mono">{s.short}</span>
                    <span className="board-name">{s.name}</span>
                    <span className="board-bar">
                      <span style={{ transform: `scaleX(${c / max})` }} />
                    </span>
                    <span className="board-count mono">{c > 0 ? fmt(c) : "be first"}</span>
                  </button>
                </li>
              );
            })}
          </ol>

          <ol className="loop mono" aria-label="How your street gets Binwala sooner">
            <li>
              <b>01</b> Join
            </li>
            <li>
              <b>02</b> Share in your society group
            </li>
            <li>
              <b>03</b> Busiest sectors go first
            </li>
          </ol>

          <div className="network-foot">
            <button className="btn btn--lime magnetic" onClick={() => select(neighbourhood || undefined)}>
              Get Binwala on your street <span className="arrow">→</span>
            </button>
            <span className="mono network-note">RWA OR APARTMENT ASSOCIATION? JOIN, THEN ADD YOUR COMMUNITY.</span>
          </div>
        </div>
      </div>
    </section>
  );
}
