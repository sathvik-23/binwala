"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useWaitlist, type Joined } from "./WaitlistContext";
import { Mark } from "./Logo";
import { CountUp } from "./CountUp";
import { OUTSIDE, PAIN_POINTS, RESIDENT_TYPES, SECTORS, areaLabel } from "@/lib/neighbourhoods";
import { fmt } from "@/lib/format";
import { track } from "@/lib/track";

/* ------------------------------ confetti ------------------------------ */

function burst(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const dpr = Math.min(window.devicePixelRatio, 2);
  const W = (canvas.width = window.innerWidth * dpr);
  const H = (canvas.height = window.innerHeight * dpr);
  const colors = ["#C8FF2E", "#C8FF2E", "#EDEFEA", "#8FE3FF", "#C8FF2E"];
  const ps = Array.from({ length: 220 }, (_, i) => {
    const a = Math.random() * Math.PI * 2;
    const sp = (6 + Math.random() * 16) * dpr;
    return {
      x: W / 2,
      y: H * 0.45,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 8 * dpr,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      w: (4 + Math.random() * 8) * dpr,
      h: (i % 3 === 0 ? 14 : 5 + Math.random() * 6) * dpr,
      c: colors[i % colors.length],
      life: 1,
    };
  });
  let raf = 0;
  const step = () => {
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const p of ps) {
      p.vx *= 0.985;
      p.vy = p.vy * 0.985 + 0.38 * dpr;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      p.life -= 0.006;
      if (p.life <= 0 || p.y > H + 40) continue;
      alive++;
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life * 1.5);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
      ctx.restore();
    }
    if (alive) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/* ------------------------------- barcode ------------------------------ */

function Barcode({ code }: { code: string }) {
  const bars = useMemo(() => {
    const out: { x: number; w: number }[] = [];
    let x = 0;
    for (const ch of (code + code).split("")) {
      const n = ch.charCodeAt(0);
      for (let b = 0; b < 4; b++) {
        const w = ((n >> b) & 1) + 1;
        out.push({ x, w });
        x += w + (((n >> (b + 2)) & 1) + 1);
      }
    }
    return { out, total: x };
  }, [code]);
  return (
    <svg className="barcode" viewBox={`0 0 ${bars.total} 30`} preserveAspectRatio="none" aria-hidden="true">
      {bars.out.map((b, i) => (
        <rect key={i} x={b.x} y="0" width={b.w} height="30" />
      ))}
    </svg>
  );
}

/* ------------------------------ pass card ----------------------------- */

function PassCard({ j }: { j: Joined }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--rx", `${(0.5 - y) * 14}deg`);
    el.style.setProperty("--ry", `${(x - 0.5) * 18}deg`);
    el.style.setProperty("--mx", `${x * 100}%`);
    el.style.setProperty("--my", `${y * 100}%`);
  };
  const reset = () => {
    ref.current?.style.setProperty("--rx", "0deg");
    ref.current?.style.setProperty("--ry", "0deg");
  };
  const date = new Date(j.joinedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
  return (
    <div className="pass-wrap" onPointerMove={onMove} onPointerLeave={reset}>
      <div className="pass" ref={ref}>
        <div className="pass-holo" />
        <div className="pass-top">
          <span className="pass-brand">
            <Mark size={20} /> binwala
          </span>
          <span className="mono pass-type">WAITLIST PASS · BLR</span>
        </div>
        <div className="pass-mid">
          <span className="mono pass-k">
            {j.neighbourhood === OUTSIDE ? "WAITLIST" : `NEIGHBOURHOOD${SECTORS.find((x) => x.id === j.neighbourhood) ? " · " + SECTORS.find((x) => x.id === j.neighbourhood)!.name.toUpperCase() : ""}`}
          </span>
          <div className="pass-hood">{j.neighbourhood === OUTSIDE ? "Early supporter" : "HSR Layout"}</div>
        </div>
        <div className="pass-grid mono">
          <div>
            <span>PASS NO.</span>
            <b>#{String(j.position).padStart(6, "0")}</b>
          </div>
          <div>
            <span>JOINED</span>
            <b>{date}</b>
          </div>
          <div>
            <span>STATUS</span>
            <b className="text-lime">EARLY ACCESS</b>
          </div>
        </div>
        <div className="pass-perf" aria-hidden="true" />
        <div className="pass-bottom">
          <Barcode code={j.referralCode} />
          <span className="mono pass-code">{j.referralCode}</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- profile ------------------------------ */

function Profile({ j }: { j: Joined }) {
  const [resident, setResident] = useState<string | null>(null);
  const [community, setCommunity] = useState("");
  const [size, setSize] = useState<number | null>(null);
  const [pains, setPains] = useState<string[]>([]);
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");

  const save = async () => {
    setState("saving");
    try {
      const r = await fetch("/api/waitlist/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: j.referralCode,
          email: j.email,
          residentType: resident,
          community: community.trim() || null,
          householdSize: size,
          painPoints: pains.length ? pains : null,
        }),
      });
      if (!r.ok) throw new Error();
      setState("done");
      track("profile_saved", { resident: resident ?? "", pains: pains.length });
    } catch {
      setState("error");
    }
  };

  if (state === "done")
    return (
      <div className="profile profile--done">
        <span className="check" aria-hidden="true" />
        <div>
          <b>Got it. Thank you.</b>
          <p>This goes straight into how we plan routes and pick the pilot.</p>
        </div>
      </div>
    );

  return (
    <div className="profile">
      <div className="profile-head">
        <span className="mono tag">OPTIONAL · 20 SEC</span>
        <b>Help us plan your pilot</b>
      </div>
      <div className="profile-field">
        <span className="mono profile-k">I LIVE IN</span>
        <div className="chips">
          {RESIDENT_TYPES.map((r) => (
            <button key={r.id} type="button" className={`chip ${resident === r.id ? "is-on" : ""}`} onClick={() => setResident(resident === r.id ? null : r.id)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="profile-row">
        <label className="profile-field">
          <span className="mono profile-k">APARTMENT / COMMUNITY</span>
          <input className="profile-input" value={community} maxLength={120} onChange={(e) => setCommunity(e.target.value)} placeholder="e.g. Prestige Lakeside" />
        </label>
        <div className="profile-field">
          <span className="mono profile-k">HOUSEHOLD</span>
          <div className="stepper">
            <button type="button" aria-label="Fewer people" onClick={() => setSize(Math.max(1, (size ?? 2) - 1))}>
              −
            </button>
            <span className="mono">{size ?? "–"}</span>
            <button type="button" aria-label="More people" onClick={() => setSize(Math.min(50, (size ?? 1) + 1))}>
              +
            </button>
          </div>
        </div>
      </div>
      <div className="profile-field">
        <span className="mono profile-k">BIGGEST HEADACHES</span>
        <div className="chips">
          {PAIN_POINTS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`chip ${pains.includes(p.id) ? "is-on" : ""}`}
              onClick={() => setPains((x) => (x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id]))}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <button className="btn btn--ghost profile-save" disabled={state === "saving" || (!resident && !community && !size && !pains.length)} onClick={save}>
        {state === "saving" ? "Saving…" : state === "error" ? "Try again" : "Save answers"}
      </button>
    </div>
  );
}

/* ------------------------------- overlay ------------------------------ */

export default function Success() {
  const { joined, successOpen, setSuccessOpen, stats } = useWaitlist();
  const canvas = useRef<HTMLCanvasElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!successOpen) return;
    document.documentElement.classList.add("is-locked");
    const lenis = (window as unknown as { __lenis?: { stop: () => void; start: () => void } }).__lenis;
    lenis?.stop();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stop = canvas.current && !reduce ? burst(canvas.current) : () => {};
    const prev = document.activeElement as HTMLElement | null;
    setTimeout(() => dialog.current?.querySelector<HTMLElement>(".share-primary")?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSuccessOpen(false);
      if (e.key === "Tab" && dialog.current) {
        const f = dialog.current.querySelectorAll<HTMLElement>("button:not([disabled]), input, a[href]");
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      stop();
      window.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("is-locked");
      lenis?.start();
      prev?.focus?.();
    };
  }, [successOpen, setSuccessOpen]);

  if (!joined || !successOpen) return null;

  const inHsr = joined.neighbourhood !== OUTSIDE;
  const hood = areaLabel(joined.neighbourhood);
  const hoodCount = stats.neighbourhoods.filter((n) => n.id !== OUTSIDE).reduce((a, n) => a + n.count, 0);
  const base = (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, "");
  const link = `${base}/?ref=${joined.referralCode}&n=${joined.neighbourhood}`;
  const msg = `I just joined the Binwala waitlist: a smarter way to collect waste, launching first in HSR Layout. If you live in HSR, join so our street gets it sooner: ${link}`;
  const milestones = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
  const next = milestones.find((m) => m > hoodCount) ?? hoodCount * 2;
  const prevM = [...milestones].reverse().find((m) => m <= hoodCount) ?? 0;
  const pct = Math.min(1, (hoodCount - prevM) / Math.max(1, next - prevM));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const t = document.createElement("textarea");
      t.value = link;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    setCopied(true);
    track("share_copy");
    setTimeout(() => setCopied(false), 2000);
  };
  const native = async () => {
    try {
      await navigator.share({ title: "Binwala", text: msg, url: link });
      track("share_native");
    } catch {}
  };

  return (
    <div className="success" role="dialog" aria-modal="true" aria-labelledby="success-title">
      <div className="success-bg" onClick={() => setSuccessOpen(false)} />
      <canvas ref={canvas} className="success-confetti" aria-hidden="true" />
      <div className="success-panel" ref={dialog}>
        <button className="success-close" aria-label="Close" onClick={() => setSuccessOpen(false)}>
          <span />
        </button>

        <div className="success-left">
          <span className="mono tag tag--lime">
            <span className="live-dot" /> {joined.alreadyJoined ? "WELCOME BACK" : "YOU'RE IN"}
          </span>
          <h2 id="success-title" className="success-h">
            {joined.alreadyJoined ? "You're already on the list." : "Welcome to the cleaner city."}
          </h2>
          <p className="success-pos">
            You&apos;re <b className="text-lime">#{<CountUp value={joined.position} format={fmt} duration={1.6} />}</b> on the waitlist.
          </p>

          {inHsr ? (
            <div className="hood-meter glass">
              <div className="hood-meter-top">
                <span>
                  <b>{hood}</b>
                </span>
                <span className="mono">
                  {fmt(hoodCount)} / {fmt(next)}
                </span>
              </div>
              <div className="hood-meter-bar">
                <span style={{ transform: `scaleX(${pct})` }} />
              </div>
              <p className="mono hood-meter-note">Help bring Binwala to your street. Share with your HSR neighbours.</p>
            </div>
          ) : (
            <div className="hood-meter glass">
              <p className="hood-meter-note hood-meter-note--solo">
                We&apos;re launching in HSR Layout first. You&apos;ll hear from us the moment we expand.
              </p>
            </div>
          )}

          <div className="share">
            <a
              className="btn btn--lime share-primary"
              href={`https://wa.me/?text=${encodeURIComponent(msg)}`}
              target="_blank"
              rel="noreferrer"
              onClick={() => track("share_whatsapp")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2l-.5-.3Z"
                />
              </svg>
              Share on WhatsApp
            </a>
            <button className="btn btn--ghost" onClick={copy}>
              {copied ? "Link copied ✓" : "Copy invite link"}
            </button>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <button className="btn btn--ghost btn--icon" onClick={native} aria-label="More share options">
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            )}
            <a
              className="btn btn--ghost btn--icon"
              aria-label="Share on X"
              href={`https://x.com/intent/post?text=${encodeURIComponent(msg)}`}
              target="_blank"
              rel="noreferrer"
              onClick={() => track("share_x")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M17.8 3h3.1l-6.8 7.7 8 10.3h-6.2l-4.9-6.3L5.4 21H2.3l7.3-8.3L2 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z" />
              </svg>
            </a>
          </div>
          {joined.referrals > 0 && (
            <p className="mono referral-note">
              <span className="text-lime">{joined.referrals}</span> neighbour{joined.referrals > 1 ? "s" : ""} joined through your link.
            </p>
          )}
        </div>

        <div className="success-right">
          <PassCard j={joined} />
          <Profile j={joined} />
        </div>
      </div>
    </div>
  );
}
