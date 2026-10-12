"use client";

import { useEffect, useRef } from "react";

const WORDS = ["Wet", "Dry", "Sanitary", "E-waste", "Scheduled", "Tracked", "Traceable", "HSR Layout first"];

export default function Marquee() {
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = track.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let x = 0;
    let v = 0;
    let lastY = window.scrollY;
    let raf = 0;
    const loop = () => {
      const y = window.scrollY;
      const dy = y - lastY;
      lastY = y;
      v += (dy * 0.25 - v) * 0.1;
      x -= 0.6 + Math.abs(v);
      const w = el.scrollWidth / 2;
      if (-x > w) x += w;
      el.style.transform = `translate3d(${x}px,0,0) skewX(${Math.max(-12, Math.min(12, -v))}deg)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const row = (k: string) =>
    WORDS.map((w, i) => (
      <span key={k + i} className="marquee-item">
        {w}
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" transform="rotate(45 12 12)" />
        </svg>
      </span>
    ));
  return (
    <div className="marquee" aria-hidden="true" data-cover>
      <div className="marquee-track" ref={track}>
        {row("a")}
        {row("b")}
      </div>
    </div>
  );
}
