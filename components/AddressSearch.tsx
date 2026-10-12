"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HSR_PIN, detectSector, inHsr, searchLocal, type Place } from "@/lib/hsr";
import { SECTORS } from "@/lib/neighbourhoods";

export type PickedAddress = {
  title: string;
  line: string;
  lat?: number;
  lng?: number;
  placeId?: string | null;
  inHsr: boolean;
  sector: string | null;
  source: Place["source"] | "gps" | "typed";
};

type Props = {
  value: PickedAddress | null;
  onPick: (a: PickedAddress | null) => void;
  flat: string;
  onFlat: (v: string) => void;
  sector: string;
  onSector: (v: string) => void;
};

const KIND_ICON: Record<string, React.ReactNode> = {
  building: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M15 9h3a1 1 0 0 1 1 1v11M3 21h18M8 8h3M8 12h3M8 16h3" />
    </svg>
  ),
  street: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 21 10 3M17 21 14 3M12 6v2M12 11v2M12 16v2" />
    </svg>
  ),
  area: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3V7ZM9 4v13M15 7v13" />
    </svg>
  ),
  landmark: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12Z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  ),
};

function Highlight({ text, q }: { text: string; q: string }) {
  const terms = q.trim().toLowerCase().split(/\s+/).filter((t) => t.length > 0);
  if (!terms.length) return <>{text}</>;
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig");
  return (
    <>
      {text.split(re).map((part, i) =>
        terms.includes(part.toLowerCase()) ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>,
      )}
    </>
  );
}

const newSession = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));

export default function AddressSearch({ value, onPick, flat, onFlat, sector, onSector }: Props) {
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const session = useRef(newSession());
  const abort = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const flatRef = useRef<HTMLInputElement>(null);

  // warm the serverless function so the first real query is fast
  useEffect(() => {
    fetch("/api/places?q=").catch(() => {});
  }, []);

  const local = useMemo(() => searchLocal(q, q.trim().length < 3 ? 4 : 3), [q]);

  useEffect(() => {
    const term = q.trim();
    abort.current?.abort();
    if (term.length < 2) {
      setRemote([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctl = new AbortController();
    abort.current = ctl;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/places?q=${encodeURIComponent(term)}&s=${session.current}`, { signal: ctl.signal });
        const j = await r.json();
        if (!ctl.signal.aborted) setRemote(j.places ?? []);
      } catch {
        /* aborted or offline: local results still show */
      } finally {
        if (!ctl.signal.aborted) setLoading(false);
      }
    }, 140);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  const results = useMemo(() => {
    const seen = new Set<string>();
    const out: Place[] = [];
    for (const p of [...remote, ...local]) {
      const k = p.title.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(p);
    }
    return out.slice(0, 8);
  }, [remote, local]);

  const showTyped = q.trim().length >= 3;
  const total = results.length + (showTyped ? 1 : 0);
  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const finish = (a: PickedAddress) => {
    onPick(a);
    setQ("");
    setRemote([]);
    session.current = newSession();
    setTimeout(() => flatRef.current?.focus({ preventScroll: true }), 120);
  };

  const pick = async (p: Place) => {
    let place = p;
    if (p.source === "google" && p.lat == null) {
      try {
        const r = await fetch(`/api/places?id=${encodeURIComponent(p.id)}&s=${session.current}`);
        const j = await r.json();
        if (j.place) place = { ...p, ...j.place, title: p.title || j.place.title };
      } catch {}
    }
    const hasPoint = place.lat != null && place.lng != null;
    finish({
      title: place.title,
      line: place.subtitle || `HSR Layout, Bengaluru ${HSR_PIN}`,
      lat: place.lat,
      lng: place.lng,
      placeId: place.source === "local" ? null : place.id,
      inHsr: hasPoint ? inHsr(place.lat!, place.lng!) : true,
      sector: place.sector ?? detectSector(`${place.title} ${place.subtitle}`),
      source: place.source,
    });
  };

  const pickTyped = () =>
    finish({
      title: q.trim(),
      line: `HSR Layout, Bengaluru ${HSR_PIN}`,
      inHsr: true,
      sector: detectSector(q),
      source: "typed",
    });

  const locate = () => {
    if (!("geolocation" in navigator)) return setGeoError("Location isn't available in this browser.");
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        let place: Place | null = null;
        try {
          const r = await fetch(`/api/places?lat=${lat}&lng=${lng}`);
          place = (await r.json()).place;
        } catch {}
        setLocating(false);
        finish({
          title: place?.title || "Pinned location",
          line: place?.subtitle || (inHsr(lat, lng) ? `HSR Layout, Bengaluru ${HSR_PIN}` : "Bengaluru"),
          lat,
          lng,
          placeId: place?.id ?? null,
          inHsr: inHsr(lat, lng),
          sector: place ? detectSector(`${place.title} ${place.subtitle}`) : null,
          source: "gps",
        });
      },
      (err) => {
        setLocating(false);
        setGeoError(err.code === 1 ? "Location permission was blocked. Type your building instead." : "Couldn't get your location. Type your building instead.");
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 60_000 },
    );
  };

  /* ------------------------------ picked ------------------------------ */

  if (value) {
    return (
      <div className="addr-picked">
        <div className={`addr-card ${value.inHsr ? "" : "is-outside"}`}>
          <span className="addr-card-pin" aria-hidden="true" />
          <div className="addr-card-text">
            <b>{value.title}</b>
            <span>{value.line}</span>
          </div>
          <button type="button" className="addr-change mono" onClick={() => onPick(null)}>
            CHANGE
          </button>
        </div>

        {value.inHsr ? (
          <>
            <label className="addr-flat">
              <span className="mono">FLAT / HOUSE NO. · FLOOR</span>
              <input
                ref={flatRef}
                data-autofocus
                className="join-input join-input--sm"
                placeholder="e.g. B-1204, Tower 2"
                value={flat}
                maxLength={60}
                onChange={(e) => onFlat(e.target.value)}
              />
            </label>
            <div className="addr-sectors">
              <span className="mono">
                WHICH SECTOR? {value.sector && sector === value.sector ? <em className="text-lime">· DETECTED</em> : null}
              </span>
              <div className="chips">
                {SECTORS.map((s) => (
                  <button type="button" key={s.id} className={`chip ${sector === s.id ? "is-on" : ""}`} onClick={() => onSector(s.id)}>
                    {s.name}
                  </button>
                ))}
                <button type="button" className={`chip ${sector === "hsr-unsure" ? "is-on" : ""}`} onClick={() => onSector("hsr-unsure")}>
                  Not sure
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="addr-outside">
            <b>That looks outside HSR Layout.</b>
            <span>We&apos;re launching in HSR first. You can still join and we&apos;ll tell you the moment we expand.</span>
          </div>
        )}
      </div>
    );
  }

  /* ------------------------------ searching ------------------------------ */

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(total - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active < results.length) pick(results[active]);
      else if (showTyped) pickTyped();
    }
  };

  return (
    <div className="addr" data-address-search>
      <div className={`addr-input ${loading ? "is-loading" : ""}`}>
        <svg viewBox="0 0 24 24" className="addr-input-icon" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          data-autofocus
          className="join-input"
          placeholder="Building, society or street"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={q.length > 0}
          aria-controls="addr-list"
          aria-activedescendant={`addr-opt-${active}`}
          aria-label="Search your building or street in HSR Layout"
        />
        <span className="addr-scan" aria-hidden="true" />
      </div>

      {!q && (
        <button type="button" className="addr-locate" onClick={locate} disabled={locating}>
          <span className={`addr-locate-dot ${locating ? "is-on" : ""}`} aria-hidden="true" />
          {locating ? "Finding you…" : "Use my current location"}
          <span className="mono">GPS</span>
        </button>
      )}
      {geoError && <p className="addr-geoerr mono">{geoError}</p>}

      {q && (
        <ul className="addr-list" id="addr-list" role="listbox" ref={listRef} data-lenis-prevent>
          {results.map((p, i) => (
            <li
              key={p.id}
              id={`addr-opt-${i}`}
              data-i={i}
              role="option"
              aria-selected={i === active}
              className={`addr-opt ${i === active ? "is-active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(p)}
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <span className={`addr-opt-icon addr-opt-icon--${p.kind}`}>{KIND_ICON[p.kind]}</span>
              <span className="addr-opt-text">
                <b>
                  <Highlight text={p.title} q={q} />
                </b>
                <span>{p.subtitle}</span>
              </span>
              <span className="addr-opt-tag mono">{p.source === "local" ? (p.kind === "street" ? "STREET" : "HSR") : p.kind.toUpperCase()}</span>
            </li>
          ))}
          {loading &&
            results.length < 3 &&
            [0, 1].map((i) => (
              <li key={`sk${i}`} className="addr-opt addr-opt--skeleton" aria-hidden="true">
                <span className="addr-opt-icon" />
                <span className="addr-opt-text">
                  <b />
                  <span />
                </span>
              </li>
            ))}
          {showTyped && (
            <li
              id={`addr-opt-${results.length}`}
              data-i={results.length}
              role="option"
              aria-selected={active === results.length}
              className={`addr-opt addr-opt--typed ${active === results.length ? "is-active" : ""}`}
              onMouseEnter={() => setActive(results.length)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={pickTyped}
            >
              <span className="addr-opt-icon">+</span>
              <span className="addr-opt-text">
                <b>Use “{q.trim()}”</b>
                <span>Can&apos;t find it? Add it as typed. HSR Layout, Bengaluru {HSR_PIN}</span>
              </span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
