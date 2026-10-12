"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import WaitlistForm from "./WaitlistForm";
import { useWaitlist } from "./WaitlistContext";
import { OUTSIDE, SECTORS, areaLabel, areaName } from "@/lib/neighbourhoods";
import { ago, fmt } from "@/lib/format";

function Split({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span className={`split ${className}`} aria-label={text}>
      {text.split(" ").map((word, wi) => (
        <span className="split-word" key={wi} aria-hidden="true">
          {word.split("").map((ch, ci) => (
            <span className="split-char" key={ci}>
              {ch}
            </span>
          ))}
          {wi < text.split(" ").length - 1 && <span className="split-space"> </span>}
        </span>
      ))}
    </span>
  );
}

function Clock() {
  const [t, setT] = useState("");
  useEffect(() => {
    const f = () =>
      setT(
        new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()),
      );
    f();
    const id = setInterval(f, 1000);
    return () => clearInterval(id);
  }, []);
  return <span suppressHydrationWarning>{t || "--:--:--"}</span>;
}

function RecentTicker() {
  const { stats } = useWaitlist();
  const [i, setI] = useState(0);
  const recent = stats.recent;
  useEffect(() => {
    if (recent.length < 2) return;
    const id = setInterval(() => setI((x) => (x + 1) % recent.length), 4200);
    return () => clearInterval(id);
  }, [recent.length]);
  if (!recent.length) return null;
  const r = recent[i % recent.length];
  return (
    <div className="recent glass mono" aria-live="off">
      <span className="live-dot" />
      <span key={i} className="recent-text">
        {r.neighbourhood === OUTSIDE ? (
          <>Someone joined</>
        ) : (
          <>
            Someone in <b>{areaLabel(r.neighbourhood)}</b> joined
          </>
        )}{" "}
        · {ago(r.at)}
      </span>
    </div>
  );
}

export default function Hero() {
  const root = useRef<HTMLElement>(null);
  const { stats, invitedTo } = useWaitlist();
  const hsrCount = stats.neighbourhoods.filter((n) => n.id !== OUTSIDE).reduce((a, n) => a + n.count, 0);
  const leader = stats.neighbourhoods.find((n) => SECTORS.some((s) => s.id === n.id));

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = gsap.context(() => {
      gsap.set(".hero-reveal", { autoAlpha: 0, y: 24 });
      gsap.set(".hero-h1 .split-char", { yPercent: 115, rotate: 6 });
      gsap.set(".hud-item", { autoAlpha: 0 });
    }, el);

    const play = () => {
      ctx.add(() => {
        const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
        tl.to(".hero-h1 .split-char", { yPercent: 0, rotate: 0, duration: reduce ? 0.01 : 1.25, stagger: reduce ? 0 : 0.028 }, 0.05)
          .to(".hero-reveal", { autoAlpha: 1, y: 0, duration: reduce ? 0.01 : 1.1, stagger: 0.08 }, 0.35)
          .to(".hud-item", { autoAlpha: 1, duration: 0.6, stagger: 0.06 }, 0.6);
      });
    };
    if ((window as unknown as { __introDone?: boolean }).__introDone) play();
    else window.addEventListener("binwala:intro", play, { once: true });

    // Scroll: headline drifts and dissolves as the city rises
    const onScroll = () => {
      const p = Math.min(1, window.scrollY / window.innerHeight);
      el.style.setProperty("--hp", p.toFixed(3));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("binwala:intro", play);
      window.removeEventListener("scroll", onScroll);
      ctx.revert();
    };
  }, []);

  return (
    <section className="hero" id="top" data-city="hero" ref={root}>
      <div className="hero-grid-overlay" aria-hidden="true" />

      <div className="hero-hud hero-hud--tr mono" aria-hidden="true">
        <span className="hud-item">
          <i className="hud-led" /> ROUTE SIM · LIVE
        </span>
        <span className="hud-item">HSR 12.9116° N 77.6474° E</span>
        <span className="hud-item">
          IST <Clock />
        </span>
        <span className="hud-item hud-note">Visualisation — not live operations</span>
      </div>

      <div className="hero-content">
        {invitedTo && (
          <div className="invite hero-reveal glass">
            <span className="mono tag tag--lime">INVITE</span>
            <span>
              {invitedTo === OUTSIDE ? (
                <>A friend invited you to Binwala.</>
              ) : (
                <>
                  Your neighbour in <b>{areaLabel(invitedTo)}</b> wants Binwala on your street.
                </>
              )}
            </span>
          </div>
        )}
        <div className="hero-eyebrow hero-reveal">
          <span className="tag tag--lime mono">
            <span className="live-dot" /> LAUNCHING IN HSR LAYOUT
          </span>
          <span className="mono eyebrow-muted">Bengaluru</span>
        </div>

        <h1 className="hero-h1">
          <Split text="Your waste." className="line-1" />
          <Split text="Our problem." className="line-2" />
        </h1>

        <p className="hero-sub hero-reveal">
          A smarter way to collect waste, built for the city you call home. Scheduled pickups, segregation made simple, and proof of where it
          all goes. <span className="text-lime">Launching first in HSR Layout.</span>
        </p>

        <div className="hero-form hero-reveal" id="hero-join">
          <span className="mono form-kicker">GET EARLY ACCESS</span>
          <WaitlistForm variant="hero" idPrefix="hero" />
        </div>

        <div className="hero-proof hero-reveal mono">
          {hsrCount > 0 ? (
            <>
              <span>
                <b className="text-lime">{fmt(hsrCount)}</b> HSR neighbours already in
              </span>
              {leader && (
                <>
                  <span className="sep">/</span>
                  <span>
                    {areaName(leader.id)} has the most signups
                  </span>
                </>
              )}
            </>
          ) : (
            <span>The waitlist just opened. Be one of the first in HSR Layout.</span>
          )}
        </div>
      </div>

      <div className="hero-foot mono" aria-hidden="true">
        <span className="hud-item">01 / THE NEXT CITY SYSTEM</span>
        <span className="hud-item scroll-cue">
          SCROLL TO EXPLORE <span className="scroll-cue-line" />
        </span>
      </div>
      <RecentTicker />
    </section>
  );
}
