"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWaitlist } from "./WaitlistContext";
import { Mark } from "./Logo";
import AddressSearch, { type PickedAddress } from "./AddressSearch";
import { bus } from "@/lib/city/bus";
import { DUMP_OPTIONS, SLOTS, formatPhone, normalizePhone, type SlotId } from "@/lib/hsr";
import { HSR_UNSURE, OUTSIDE, areaLabel } from "@/lib/neighbourhoods";
import { track } from "@/lib/track";

type StepKey = "email" | "name" | "phone" | "address" | "dumps" | "slot";

const STEPS: { key: StepKey; kicker: string; q: string; hint: string }[] = [
  { key: "email", kicker: "EMAIL", q: "Where should we send your pass?", hint: "Your waitlist pass and launch news land here. Nothing else." },
  { key: "name", kicker: "NAME", q: "What should we call you?", hint: "So your pickup crew knows who they're collecting for." },
  { key: "phone", kicker: "PHONE", q: "Your mobile number?", hint: "Only for pickup-day updates. Never shared, never sold." },
  { key: "address", kicker: "ADDRESS", q: "Where do we pick up from?", hint: "Start typing your building, society or street in HSR Layout." },
  { key: "dumps", kicker: "BIN RUNS", q: "How many times a day does your waste go out?", hint: "Helps us size your pickups. A rough guess is fine." },
  { key: "slot", kicker: "PICKUP TIME", q: "When should we come by?", hint: "Pick the window that fits your home. You can change it later." },
];

type Draft = {
  email: string;
  name: string;
  phone: string; // digits as typed
  address: PickedAddress | null;
  flat: string;
  sector: string;
  dumps: number;
  slot: SlotId | "";
};

const EMPTY: Draft = { email: "", name: "", phone: "", address: null, flat: "", sector: "", dumps: 0, slot: "" };
const SS_KEY = "binwala_join_draft_v2";
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

/* ------------------------------- small art ------------------------------- */

function BinArt({ n }: { n: number }) {
  return (
    <svg viewBox="0 0 64 64" className="bin-art" aria-hidden="true">
      <rect x="12" y="12" width="40" height="5" rx="2" className="bin-art-lid" />
      <path d="M15 21h34l-3 33a4 4 0 0 1-4 3.6H22a4 4 0 0 1-4-3.6L15 21Z" className="bin-art-body" />
      {Array.from({ length: Math.min(n, 4) }, (_, i) => (
        <rect key={i} x="21" y={48 - i * 7.5} width="22" height="6" rx="2" className="bin-art-bag" style={{ animationDelay: `${i * 70}ms` }} />
      ))}
    </svg>
  );
}

function SkyArt({ id }: { id: SlotId }) {
  // sun / moon travels along an arc according to the time window
  const pos: Record<SlotId, number> = { morning: 0.2, afternoon: 0.5, evening: 0.82, midnight: 0.5 };
  const t = pos[id];
  const x = 10 + t * 80;
  const y = 70 - Math.sin(t * Math.PI) * 52;
  return (
    <svg viewBox="0 0 100 80" className={`sky-art sky-art--${id}`} aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <path d="M6 72 Q50 -10 94 72" className="sky-art-arc" />
      {id === "midnight" &&
        [
          [18, 18],
          [32, 30],
          [70, 14],
          [84, 34],
          [52, 22],
          [24, 46],
          [78, 52],
        ].map(([sx, sy], i) => <circle key={i} cx={sx} cy={sy} r={i % 3 === 0 ? 1.1 : 0.7} className="sky-art-star" style={{ animationDelay: `${i * 0.4}s` }} />)}
      {id === "midnight" ? (
        <g transform={`translate(${x} ${y})`}>
          <circle r="9" className="sky-art-moon" />
          <circle r="9" cx="4" cy="-3" className="sky-art-moon-cut" />
        </g>
      ) : (
        <g transform={`translate(${x} ${y})`}>
          <circle r="16" className="sky-art-glow" />
          <circle r="8" className="sky-art-sun" />
        </g>
      )}
      <path d="M0 72h100v8H0z" className="sky-art-ground" />
      {[8, 18, 26, 38, 47, 58, 66, 77, 88].map((bx, i) => (
        <rect key={i} x={bx} y={72 - (6 + ((i * 37) % 14))} width="7" height={6 + ((i * 37) % 14)} className="sky-art-bld" />
      ))}
    </svg>
  );
}

/* --------------------------------- flow ---------------------------------- */

export default function JoinFlow() {
  const { joinOpen, joinPrefill, closeJoin, completeSignup, ref, utm } = useWaitlist();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [d, setD] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [shake, setShake] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const restored = useRef(false);

  const set = useCallback(<K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v })), []);

  /* open / close: lock the page, wake the city, restore any half-finished draft */
  useEffect(() => {
    if (!joinOpen) return;
    let saved: Draft | null = null;
    try {
      const raw = sessionStorage.getItem(SS_KEY);
      if (raw) saved = { ...EMPTY, ...JSON.parse(raw) };
    } catch {}
    const base = saved ?? EMPTY;
    const email = joinPrefill.email || base.email;
    const next: Draft = { ...base, email, sector: joinPrefill.neighbourhood && joinPrefill.neighbourhood !== OUTSIDE ? joinPrefill.neighbourhood : base.sector };
    setD(next);
    restored.current = true;
    // jump past steps already answered
    let s = 0;
    if (isEmail(next.email)) s = 1;
    if (s === 1 && next.name.trim().length > 1) s = 2;
    if (s === 2 && normalizePhone(next.phone)) s = 3;
    setStep(s);
    setDir(1);
    setError(null);

    document.documentElement.classList.add("is-locked", "is-joining");
    const lenis = (window as unknown as { __lenis?: { stop: () => void; start: () => void } }).__lenis;
    lenis?.stop();
    bus.signup.active = true;
    window.dispatchEvent(new Event("binwala:signup"));
    if (isEmail(email) && joinPrefill.email) saveDraft({ email, step: 1 });
    return () => {
      document.documentElement.classList.remove("is-locked", "is-joining");
      lenis?.start();
      bus.signup.active = false;
      bus.signup.pin = null;
      bus.signup.slot = null;
      bus.signup.dumps = 0;
      window.dispatchEvent(new Event("binwala:signup"));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinOpen]);

  /* keep the city and sessionStorage in sync with answers */
  useEffect(() => {
    if (!joinOpen) return;
    bus.signup.pin = d.address?.lat != null && d.address?.lng != null ? { lat: d.address.lat, lng: d.address.lng } : null;
    bus.signup.slot = d.slot || null;
    bus.signup.dumps = d.dumps;
    if (restored.current) {
      try {
        sessionStorage.setItem(SS_KEY, JSON.stringify(d));
      } catch {}
    }
  }, [d, joinOpen]);

  /* focus the main field of each step */
  useEffect(() => {
    if (!joinOpen) return;
    const id = setTimeout(() => panel.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true }), 380);
    return () => clearTimeout(id);
  }, [step, joinOpen]);

  const saveDraft = (body: { email: string; name?: string; phone?: string; step: number }) => {
    try {
      fetch("/api/waitlist/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true });
    } catch {}
  };

  const key = STEPS[step].key;
  const phoneOk = normalizePhone(d.phone);

  const valid = useMemo(() => {
    switch (key) {
      case "email":
        return isEmail(d.email) || "Enter a valid email address.";
      case "name":
        return d.name.trim().length >= 2 || "Tell us your name.";
      case "phone":
        return Boolean(phoneOk) || "Enter a 10-digit Indian mobile number.";
      case "address":
        if (!d.address) return "Pick your building or street from the list.";
        if (d.address.inHsr && !d.sector) return "Which sector of HSR are you in?";
        return true;
      case "dumps":
        return d.dumps > 0 || "Pick one.";
      case "slot":
        return Boolean(d.slot) || "Pick a pickup time.";
    }
  }, [key, d, phoneOk]);

  const fail = (msg: string) => {
    setError(msg);
    setShake((s) => s + 1);
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const a = d.address!;
      const neighbourhood = a.inHsr ? d.sector || HSR_UNSURE : OUTSIDE;
      const r = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: d.email.trim(),
          name: d.name.trim(),
          phone: d.phone,
          neighbourhood,
          address: { title: a.title, line: a.line, placeId: a.placeId ?? null, lat: a.lat ?? null, lng: a.lng ?? null },
          flat: d.flat.trim() || null,
          dumpsPerDay: d.dumps,
          pickupSlot: d.slot,
          ref,
          utm,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const map: Record<string, number> = { email: 0, name: 1, phone: 2, address: 3, neighbourhood: 3, dumpsPerDay: 4, pickupSlot: 5 };
        if (data.field && map[data.field] !== undefined && map[data.field] !== step) {
          setDir(-1);
          setStep(map[data.field]);
        }
        fail(data.error ?? "Something went wrong. Try again?");
        track("signup_error", { status: r.status });
        return;
      }
      track("signup_success", { neighbourhood, slot: d.slot, dumps: d.dumps, referred: Boolean(ref), already: Boolean(data.alreadyJoined) });
      try {
        sessionStorage.removeItem(SS_KEY);
      } catch {}
      completeSignup({
        ...data,
        email: d.email.trim(),
        name: d.name.trim(),
        phone: phoneOk!,
        addressTitle: a.title,
        flat: d.flat.trim() || null,
        pickupSlot: d.slot,
        dumpsPerDay: d.dumps,
        joinedAt: new Date().toISOString(),
      });
      setD(EMPTY);
    } catch {
      fail("You seem to be offline. Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  };

  const next = () => {
    if (valid !== true) return fail(valid);
    setError(null);
    track("join_step", { step: key });
    if (step >= 1 || key === "email") saveDraft({ email: d.email.trim(), name: d.name.trim() || undefined, phone: phoneOk ?? undefined, step: step + 1 });
    if (step === STEPS.length - 1) return void submit();
    setDir(1);
    setStep((s) => s + 1);
  };

  const back = () => {
    if (step === 0) return closeJoin();
    setError(null);
    setDir(-1);
    setStep((s) => s - 1);
  };

  const goTo = (i: number) => {
    if (i >= step) return;
    setError(null);
    setDir(-1);
    setStep(i);
  };

  /* keyboard: Enter = continue, Esc = close, 1–4 on choice steps */
  useEffect(() => {
    if (!joinOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inSearch = target.closest?.("[data-address-search]");
      if (e.key === "Escape" && !inSearch) closeJoin();
      if (e.key === "Enter" && !e.shiftKey && !inSearch && !(target.tagName === "BUTTON")) {
        e.preventDefault();
        next();
      }
      if ((key === "dumps" || key === "slot") && /^[1-4]$/.test(e.key) && target.tagName !== "INPUT") {
        const i = Number(e.key) - 1;
        if (key === "dumps") pickDumps(DUMP_OPTIONS[i].id);
        else set("slot", SLOTS[i].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const pickDumps = (n: number) => {
    set("dumps", n);
    setError(null);
    setTimeout(() => {
      setDir(1);
      setStep((s) => (STEPS[s].key === "dumps" ? s + 1 : s));
    }, 420);
  };

  if (!joinOpen) return null;

  const pct = ((step + (valid === true ? 1 : 0.4)) / STEPS.length) * 100;
  const slotMeta = SLOTS.find((s) => s.id === d.slot);
  const first = d.name.trim().split(/\s+/)[0];

  return (
    <div className={`join join--${key} ${d.slot ? `join--sky-${d.slot}` : ""}`} role="dialog" aria-modal="true" aria-labelledby="join-q">
      <div className="join-veil" />

      <header className="join-top">
        <div className="join-brand">
          <Mark size={24} />
          <span className="mono">WAITLIST · HSR LAYOUT</span>
        </div>
        <ol className="join-progress" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s.key} className={i < step ? "is-done" : i === step ? "is-now" : ""}>
              <button type="button" onClick={() => goTo(i)} disabled={i >= step} aria-label={`Step ${i + 1}: ${s.kicker}`}>
                <span style={i === step ? { transform: `scaleX(${valid === true ? 1 : 0.3})` } : undefined} />
              </button>
            </li>
          ))}
        </ol>
        <button className="join-close" onClick={closeJoin} aria-label="Close">
          <span />
        </button>
      </header>

      <div className="join-body" ref={panel}>
        <div key={step} className={`join-step ${dir > 0 ? "from-below" : "from-above"}`}>
          <div className="join-kicker mono">
            <span className="text-lime">{String(step + 1).padStart(2, "0")}</span> / {String(STEPS.length).padStart(2, "0")} — {STEPS[step].kicker}
          </div>
          <h2 id="join-q" className="join-q">
            {key === "phone" && first ? (
              <>
                Nice to meet you, <span className="text-lime">{first}.</span>
                <br />
                Your mobile number?
              </>
            ) : (
              STEPS[step].q
            )}
          </h2>
          <p className="join-hint">{STEPS[step].hint}</p>

          <div key={shake} className={`join-field ${shake && error ? "shake" : ""}`}>
            {key === "email" && (
              <input
                data-autofocus
                className="join-input"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@email.com"
                value={d.email}
                onChange={(e) => set("email", e.target.value)}
                aria-label="Email"
              />
            )}

            {key === "name" && (
              <input
                data-autofocus
                className="join-input"
                autoComplete="name"
                autoCapitalize="words"
                placeholder="Full name"
                value={d.name}
                maxLength={80}
                onChange={(e) => set("name", e.target.value)}
                aria-label="Full name"
              />
            )}

            {key === "phone" && (
              <div className={`join-phone ${phoneOk ? "is-ok" : ""}`}>
                <span className="join-phone-cc mono">+91</span>
                <input
                  data-autofocus
                  className="join-input"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="98765 43210"
                  value={d.phone.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "").slice(0, 10).replace(/^(\d{5})(\d+)/, "$1 $2")}
                  onChange={(e) => set("phone", e.target.value.replace(/[^\d+]/g, "").slice(0, 14))}
                  aria-label="Mobile number"
                />
                <span className="join-phone-ok" aria-hidden="true" />
              </div>
            )}

            {key === "address" && (
              <AddressSearch
                value={d.address}
                onPick={(a) => {
                  setD((x) => ({ ...x, address: a, sector: a?.sector ?? (a && x.sector && x.sector !== OUTSIDE ? x.sector : "") }));
                  setError(null);
                  if (a) track("join_location", { source: a.source, inHsr: a.inHsr });
                }}
                flat={d.flat}
                onFlat={(v) => set("flat", v)}
                sector={d.sector}
                onSector={(v) => {
                  set("sector", v);
                  setError(null);
                }}
              />
            )}

            {key === "dumps" && (
              <div className="choice-grid choice-grid--dumps" role="radiogroup" aria-label="Times a day">
                {DUMP_OPTIONS.map((o, i) => (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={d.dumps === o.id}
                    className={`choice ${d.dumps === o.id ? "is-on" : ""}`}
                    onClick={() => pickDumps(o.id)}
                  >
                    <span className="choice-key mono">{i + 1}</span>
                    <BinArt n={o.id} />
                    <span className="choice-label">{o.label}</span>
                    <span className="choice-hint">{o.hint}</span>
                  </button>
                ))}
              </div>
            )}

            {key === "slot" && (
              <div className="choice-grid choice-grid--slots" role="radiogroup" aria-label="Pickup time">
                {SLOTS.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={d.slot === s.id}
                    className={`choice choice--slot choice--${s.id} ${d.slot === s.id ? "is-on" : ""}`}
                    onClick={() => {
                      set("slot", s.id);
                      setError(null);
                    }}
                  >
                    <SkyArt id={s.id} />
                    <span className="choice-key mono">{i + 1}</span>
                    <span className="choice-label">{s.label}</span>
                    <span className="choice-hint mono">{s.time}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className={`join-error mono ${error ? "is-on" : ""}`} role="status" aria-live="polite">
            {error ?? " "}
          </p>
        </div>
      </div>

      <footer className="join-foot">
        <button type="button" className="join-back" onClick={back}>
          ← {step === 0 ? "Close" : "Back"}
        </button>
        <div className="join-foot-r">
          <span className="join-enter mono">
            press <kbd>Enter ↵</kbd>
          </span>
          {key !== "dumps" && (
            <button
              type="button"
              className={`btn btn--lime join-next ${valid === true ? "is-ready" : ""} ${submitting ? "is-loading" : ""}`}
              onClick={next}
              disabled={submitting}
            >
              <span className="btn-label">
                {key === "slot" ? (submitting ? "Securing your spot" : "Join the waitlist") : "Continue"} <span className="arrow">→</span>
              </span>
              <span className="btn-spinner" aria-hidden="true" />
            </button>
          )}
        </div>
      </footer>

      {/* the pass assembles itself as you answer */}
      <aside className="join-pass" aria-hidden="true">
        <div className="jp">
          <div className="jp-top">
            <span className="jp-brand">
              <Mark size={16} /> binwala
            </span>
            <span className="mono">WAITLIST PASS · DRAFT</span>
          </div>
          <div className={`jp-name ${d.name.trim() ? "is-set" : ""}`}>{d.name.trim() || "Your name"}</div>
          <div className="jp-rows mono">
            <div className={d.address ? "is-set" : ""}>
              <span>PICKUP</span>
              <b>{d.address ? [d.flat, d.address.title].filter(Boolean).join(", ") : "—"}</b>
            </div>
            <div className={d.address ? "is-set" : ""}>
              <span>AREA</span>
              <b>{d.address ? (d.address.inHsr ? areaLabel(d.sector || HSR_UNSURE) : "Outside HSR") : "HSR Layout"}</b>
            </div>
            <div className={phoneOk ? "is-set" : ""}>
              <span>PHONE</span>
              <b>{phoneOk ? formatPhone(phoneOk).replace(/(\d{3})\s?(\d{2})$/, "•• $2") : "—"}</b>
            </div>
            <div className={d.dumps ? "is-set" : ""}>
              <span>BIN RUNS</span>
              <b>{d.dumps ? `${d.dumps >= 4 ? "4+" : d.dumps}× a day` : "—"}</b>
            </div>
            <div className={slotMeta ? "is-set" : ""}>
              <span>TIME</span>
              <b>{slotMeta ? `${slotMeta.label} · ${slotMeta.time}` : "—"}</b>
            </div>
          </div>
          <div className="jp-bar">
            <span style={{ transform: `scaleX(${pct / 100})` }} />
          </div>
        </div>
      </aside>
    </div>
  );
}

