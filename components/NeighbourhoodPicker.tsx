"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AREAS, OUTSIDE, areaName } from "@/lib/neighbourhoods";
import { useWaitlist } from "./WaitlistContext";

type Props = { value: string; onChange: (id: string) => void; invalid?: boolean; id?: string };

export default function NeighbourhoodPicker({ value, onChange, invalid, id }: Props) {
  const { stats } = useWaitlist();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [place, setPlace] = useState<React.CSSProperties>({});
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const counts = useMemo(() => new Map(stats.neighbourhoods.map((n) => [n.id, n.count])), [stats]);
  const options = useMemo(() => AREAS.map((a) => ({ ...a, count: counts.get(a.id) ?? 0 })), [counts]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const f = () => setSheet(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);

  useEffect(() => {
    if (!open) return;
    const i = Math.max(0, options.findIndex((o) => o.id === value));
    setActive(i);
    requestAnimationFrame(() => listRef.current?.focus({ preventScroll: true }));
    // Float the menu in a body-level layer so no section's stacking context can bury it.
    const btn = root.current?.querySelector(".picker-btn") as HTMLElement | null;
    if (btn) {
      const r = btn.getBoundingClientRect();
      const below = window.innerHeight - r.bottom;
      const up = below < 440 && r.top > below;
      setPlace({
        left: Math.min(Math.max(8, r.left + r.width / 2 - 190), window.innerWidth - 388),
        ...(up ? { bottom: window.innerHeight - r.top + 12 } : { top: r.bottom + 12 }),
      });
    }
    const onScroll = () => setOpen(false);
    window.addEventListener("scroll", onScroll, { passive: true, once: true });
    window.addEventListener("resize", onScroll, { once: true });
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!root.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (oid: string) => {
    onChange(oid);
    setOpen(false);
    (root.current?.querySelector(".picker-btn") as HTMLButtonElement | null)?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (options[active]) pick(options[active].id);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const pop = (
    <div className={`picker-pop glass ${sheet ? "picker-pop--sheet" : "picker-pop--float"}`} ref={popRef} style={sheet ? undefined : place}>
      <div className="picker-head mono">
        <span>HSR LAYOUT · PICK YOUR SECTOR</span>
      </div>
      <ul
        className="picker-list"
        role="listbox"
        id={listId}
        ref={listRef}
        tabIndex={-1}
        aria-label="HSR Layout sectors"
        data-lenis-prevent
        aria-activedescendant={`${listId}-${active}`}
        onKeyDown={onKey}
      >
        {options.map((o, i) => (
          <li
            key={o.id}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={value === o.id}
            className={`picker-opt ${i === active ? "is-active" : ""} ${value === o.id ? "is-selected" : ""} ${o.id === OUTSIDE ? "is-muted" : ""}`}
            onMouseEnter={() => setActive(i)}
            onClick={() => pick(o.id)}
          >
            <span className="picker-opt-name">{o.name}</span>
            <span className="picker-opt-count mono">{o.id === OUTSIDE ? "" : o.count > 0 ? `${o.count} in` : "be first"}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className={`picker ${open ? "is-open" : ""} ${invalid ? "is-invalid" : ""}`} ref={root}>
      <button
        type="button"
        id={id}
        className={`picker-btn ${value ? "has-value" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" className="picker-pin">
          <path d="M12 22s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12Z" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="10" r="2.5" fill="currentColor" />
        </svg>
        <span className="picker-label">{value ? areaName(value) : "Your HSR sector"}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" className="picker-chev">
          <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </button>

      {open &&
        createPortal(
          sheet ? (
            <div className="picker-sheet-wrap">
              <div className="picker-backdrop" onClick={() => setOpen(false)} />
              {pop}
            </div>
          ) : (
            pop
          ),
          document.body,
        )}
    </div>
  );
}
