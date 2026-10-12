"use client";

import { useEffect, useState } from "react";
import { bus } from "@/lib/city/bus";
import { Mark } from "./Logo";

const LINES = [
  "BINWALA/OS 0.1 — BOOT",
  "LAUNCH ZONE .......... HSR LAYOUT",
  "12.9116° N  77.6474° E",
  "MAPPING 7 SECTORS",
  "COLLECTION ROUTES .... ONLINE",
];

export function introDone() {
  window.dispatchEvent(new Event("binwala:intro"));
  (window as unknown as { __introDone?: boolean }).__introDone = true;
}

export default function Loader() {
  const [state, setState] = useState<"boot" | "out" | "gone">("boot");
  const [progress, setProgress] = useState(0);
  const [lines, setLines] = useState(0);

  useEffect(() => {
    let skip = false;
    try {
      skip = sessionStorage.getItem("bw_intro") === "1";
      sessionStorage.setItem("bw_intro", "1");
    } catch {}
    if (skip || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setState("gone");
      requestAnimationFrame(introDone);
      return;
    }

    const start = performance.now();
    const MIN = 1000;
    const MAX = 2200;
    let raf = 0;
    let finished = false;
    const tick = () => {
      const t = performance.now() - start;
      const ready = bus.ready;
      const target = ready ? Math.min(1, t / MIN) : Math.min(0.9, t / MAX);
      setProgress((p) => Math.max(p, target));
      setLines(Math.min(LINES.length, Math.floor((t / MIN) * LINES.length) + 1));
      if ((ready && t >= MIN) || t >= MAX) {
        if (!finished) {
          finished = true;
          setProgress(1);
          setLines(LINES.length);
          setTimeout(() => {
            setState("out");
            introDone();
          }, 180);
          setTimeout(() => setState("gone"), 1300);
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (state === "gone") return null;

  return (
    <div className={`loader ${state === "out" ? "is-out" : ""}`} role="presentation">
      <div className="loader-panel loader-panel--top" />
      <div className="loader-panel loader-panel--bottom" />
      <div className="loader-inner">
        <div className="loader-mark">
          <Mark size={44} />
        </div>
        <ul className="loader-lines mono">
          {LINES.slice(0, lines).map((l, i) => (
            <li key={l} style={{ animationDelay: `${i * 0.02}s` }}>
              <span className="loader-caret">›</span> {l}
            </li>
          ))}
        </ul>
        <div className="loader-bar">
          <span style={{ transform: `scaleX(${progress})` }} />
        </div>
        <div className="loader-pct mono">{String(Math.round(progress * 100)).padStart(3, "0")}%</div>
      </div>
    </div>
  );
}
