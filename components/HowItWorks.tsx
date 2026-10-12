"use client";

import { useEffect, useRef, useState } from "react";

function PhoneBook() {
  return (
    <div className="device">
      <div className="device-notch" />
      <div className="ui">
        <div className="ui-top">
          <span className="ui-brand">binwala</span>
          <span className="ui-chip mono">HSR · SEC 2</span>
        </div>
        <div className="ui-title">Schedule a pickup</div>
        <div className="ui-days">
          {["MON", "TUE", "WED", "THU", "FRI"].map((d, i) => (
            <span key={d} className={`ui-day ${i === 1 ? "is-on" : ""}`}>
              <small className="mono">{d}</small>
              {13 + i}
            </span>
          ))}
        </div>
        <div className="ui-slots">
          {["6:00 – 7:00 AM", "7:00 – 8:00 AM", "8:00 – 9:00 AM"].map((s, i) => (
            <div key={s} className={`ui-slot ${i === 1 ? "is-picked" : ""}`}>
              <span>{s}</span>
              <span className="mono">{i === 1 ? "SELECTED" : i === 0 ? "2 LEFT" : "OPEN"}</span>
            </div>
          ))}
        </div>
        <div className="ui-streams">
          {[
            ["Wet", true],
            ["Dry", true],
            ["Sanitary", false],
            ["E-waste", true],
          ].map(([n, on]) => (
            <span key={String(n)} className={`ui-toggle ${on ? "is-on" : ""}`}>
              <i />
              {n}
            </span>
          ))}
        </div>
        <div className="ui-cta">Confirm pickup →</div>
        <span className="tap" />
      </div>
    </div>
  );
}

function SortBins() {
  const bins = [
    { k: "wet", label: "WET", c: "var(--lime)" },
    { k: "dry", label: "DRY", c: "#EDEFEA" },
    { k: "san", label: "SANITARY", c: "var(--amber)" },
    { k: "ew", label: "E-WASTE", c: "var(--ice)" },
  ];
  return (
    <div className="sorter">
      <div className="sorter-items" aria-hidden="true">
        <svg className="drop drop--wet" viewBox="0 0 40 40"><path d="M8 28c6-2 12-10 14-20 4 6 4 18-6 22-4 2-7 1-8-2Z" fill="var(--lime)" /></svg>
        <svg className="drop drop--dry" viewBox="0 0 40 40"><rect x="14" y="4" width="12" height="32" rx="4" fill="none" stroke="#EDEFEA" strokeWidth="3" /><rect x="16" y="1" width="8" height="5" fill="#EDEFEA" /></svg>
        <svg className="drop drop--san" viewBox="0 0 40 40"><rect x="7" y="10" width="26" height="20" rx="6" fill="none" stroke="var(--amber)" strokeWidth="3" /><path d="M7 20h26" stroke="var(--amber)" strokeWidth="3" /></svg>
        <svg className="drop drop--ew" viewBox="0 0 40 40"><rect x="12" y="8" width="16" height="28" rx="3" fill="none" stroke="var(--ice)" strokeWidth="3" /><rect x="16" y="4" width="8" height="5" fill="var(--ice)" /><path d="m21 14-4 7h6l-4 7" fill="none" stroke="var(--ice)" strokeWidth="2.4" /></svg>
      </div>
      <div className="sorter-bins">
        {bins.map((b) => (
          <div key={b.k} className={`bin bin--${b.k}`} style={{ "--c": b.c } as React.CSSProperties}>
            <div className="bin-lid" />
            <div className="bin-body">
              <span className="bin-fill" />
            </div>
            <span className="mono bin-label">{b.label}</span>
          </div>
        ))}
      </div>
      <div className="sorter-tip mono">
        <span className="text-lime">TIP</span> Tea bags → wet. Chip packets → dry. Batteries never in the bin.
      </div>
    </div>
  );
}

function LiveMap() {
  return (
    <div className="livemap">
      <svg viewBox="0 0 400 300" className="livemap-svg" aria-hidden="true">
        <defs>
          <pattern id="lm-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0H0V20" fill="none" stroke="rgba(255,255,255,0.05)" />
          </pattern>
        </defs>
        <rect width="400" height="300" fill="url(#lm-grid)" />
        <g stroke="rgba(255,255,255,0.12)" strokeWidth="8" fill="none" strokeLinecap="round">
          <path d="M-10 230 L130 230 L130 120 L280 120 L280 40 L410 40" />
          <path d="M60 -10 V310" />
          <path d="M200 310 V120" />
          <path d="M-10 70 H410" />
          <path d="M340 310 V120" />
        </g>
        <path id="lm-route" d="M30 230 L130 230 L130 120 L280 120 L280 70" className="livemap-route" />
        <circle cx="280" cy="70" r="9" className="livemap-home" />
        <circle cx="280" cy="70" r="20" className="livemap-home-ring" />
        <g className="livemap-pod">
          <circle r="7" fill="var(--lime)" />
          <circle r="16" fill="var(--lime)" opacity="0.18" />
          <animateMotion dur="7s" repeatCount="indefinite" rotate="auto" keyPoints="0;1;1" keyTimes="0;0.85;1" calcMode="linear">
            <mpath href="#lm-route" />
          </animateMotion>
        </g>
      </svg>
      <div className="livemap-card glass">
        <div className="mono livemap-k">
          <span className="live-dot" /> PICKUP EN ROUTE
        </div>
        <div className="livemap-eta">
          Arriving in <b>6 min</b>
        </div>
        <div className="livemap-row mono">
          <span>COLLECTOR</span>
          <span>VERIFIED · BW-0427</span>
        </div>
        <div className="livemap-bar">
          <span />
        </div>
      </div>
    </div>
  );
}

function Receipt() {
  const rows = [
    { s: "Wet", kg: "2.4", to: "Composting", c: "var(--lime)", w: 62 },
    { s: "Dry", kg: "1.1", to: "Material recovery", c: "#EDEFEA", w: 28 },
    { s: "E-waste", kg: "0.2", to: "Authorised recycler", c: "var(--ice)", w: 5 },
    { s: "Sanitary", kg: "0.2", to: "Safe disposal", c: "var(--amber)", w: 5 },
  ];
  return (
    <div className="receipt glass">
      <div className="receipt-head">
        <span className="ui-brand">binwala</span>
        <span className="mono">PICKUP #A-20931</span>
      </div>
      <div className="receipt-title">Where your waste went</div>
      <div className="receipt-bar">
        {rows.map((r) => (
          <span key={r.s} style={{ width: `${r.w}%`, background: r.c }} />
        ))}
      </div>
      <ul className="receipt-rows">
        {rows.map((r, i) => (
          <li key={r.s} style={{ animationDelay: `${0.2 + i * 0.15}s` }}>
            <i style={{ background: r.c }} />
            <span>{r.s}</span>
            <span className="mono">{r.kg} kg</span>
            <span className="receipt-arrow">→</span>
            <span className="receipt-to">{r.to}</span>
          </li>
        ))}
      </ul>
      <div className="receipt-foot mono">
        <span>KEPT OUT OF LANDFILL</span>
        <b className="text-lime">95%</b>
      </div>
      <div className="receipt-stamp mono">SAMPLE</div>
    </div>
  );
}

const STEPS = [
  {
    n: "01",
    k: "BOOK",
    title: "Pickups on your schedule.",
    body: "Choose a slot that fits your morning. No more chasing the truck, missed whistles, or bags waiting by the gate.",
    ui: <PhoneBook />,
  },
  {
    n: "02",
    k: "SORT",
    title: "Segregation, made obvious.",
    body: "Clear streams, simple guides and the right bags for each. Wet, dry, sanitary and e-waste stay separate from your kitchen to the plant.",
    ui: <SortBins />,
  },
  {
    n: "03",
    k: "COLLECT",
    title: "Tracked like a delivery.",
    body: "Know when your collector is close, who they are, and when it's done. Accountability you can see in real time.",
    ui: <LiveMap />,
  },
  {
    n: "04",
    k: "TRACE",
    title: "Proof of where it went.",
    body: "Every pickup closes with a receipt showing where each stream ended up. Compost, recycling or safe disposal, never a mystery.",
    ui: <Receipt />,
  },
];

// Each step stays up for roughly the time it takes to read it (~240 wpm + a beat to look at the screen).
const readMs = (text: string) => 1800 + text.split(/\s+/).length * 250;

export default function HowItWorks() {
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(false);
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(() => setActive((a) => (a + 1) % STEPS.length), readMs(STEPS[active].title + " " + STEPS[active].body));
    return () => clearTimeout(id);
  }, [active, visible]);

  // Clicking jumps to a step; the timer restarts from there so it keeps flowing.
  const choose = (i: number) => setActive(i);

  return (
    <section className="system" id="system" data-cover ref={root}>
      <div className="system-inner">
        <div className="system-left">
          <div className="section-label mono">
            <span>03</span> / HOW IT WORKS
          </div>
          <h2 className="h2" data-reveal>
            Four steps.
            <br />
            <span className="text-dim">Zero guesswork.</span>
          </h2>
          <div className="steps" role="tablist" aria-label="How Binwala works">
            {STEPS.map((s, i) => (
              <button
                key={s.n}
                role="tab"
                id={`step-tab-${i}`}
                aria-selected={active === i}
                aria-controls="step-stage"
                className={`step-tab ${active === i ? "is-active" : ""}`}
                onClick={() => choose(i)}
              >
                <span className="step-tab-n mono">{s.n}</span>
                <span className="step-tab-body">
                  <span className="step-tab-title">{s.title}</span>
                  <span className="step-tab-text">
                    <span>{s.body}</span>
                  </span>
                </span>
                <span
                  className={`step-tab-bar ${active === i && visible ? "is-running" : ""}`}
                  style={{ animationDuration: `${readMs(s.title + " " + s.body)}ms` }}
                  key={`${active}-${visible}`}
                />
              </button>
            ))}
          </div>
          <span className="mono concept-note">CONCEPT SCREENS · SUBJECT TO CHANGE</span>
        </div>

        <div className="stage" id="step-stage" role="tabpanel" aria-labelledby={`step-tab-${active}`}>
          <span className="stage-k mono">
            <span className="text-lime">{STEPS[active].n}</span> — {STEPS[active].k}
          </span>
          {STEPS.map((s, i) => (
            <div key={s.n} className={`stage-ui ${active === i ? "is-active" : ""}`} aria-hidden={active !== i}>
              {s.ui}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
