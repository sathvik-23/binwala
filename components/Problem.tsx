"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const STATEMENT =
  "Every day, Bengaluru throws away thousands of tonnes of waste. Most of it leaves your door on no fixed schedule, half-segregated, and then disappears. Nobody can tell you where it went.";
const HIGHLIGHT = new Set(["thousands", "tonnes", "schedule,", "half-segregated,", "disappears."]);

export default function Problem() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const el = root.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".ps-word",
        { opacity: 0.12 },
        {
          opacity: 1,
          stagger: 0.05,
          ease: "none",
          scrollTrigger: { trigger: ".problem-statement", start: "top 85%", end: "bottom 45%", scrub: 0.5 },
        },
      );
      gsap.fromTo(
        ".trail-path",
        { strokeDashoffset: 1 },
        { strokeDashoffset: 0, ease: "none", scrollTrigger: { trigger: ".trail", start: "top 85%", end: "bottom 50%", scrub: 0.6 } },
      );
      gsap.utils.toArray<HTMLElement>(".stat-num[data-to]").forEach((n) => {
        const to = Number(n.dataset.to);
        const o = { v: 0 };
        gsap.to(o, {
          v: to,
          duration: 1.8,
          ease: "expo.out",
          scrollTrigger: { trigger: n, start: "top 85%", once: true },
          onUpdate: () => (n.textContent = new Intl.NumberFormat("en-IN").format(Math.round(o.v))),
        });
      });
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <section className="problem" id="problem" data-cover ref={root}>
      <div className="problem-sticky">
        <div className="section-label mono">
          <span>02</span> / THE PROBLEM
        </div>
        <p className="problem-statement">
          {STATEMENT.split(" ").map((w, i) => (
            <span key={i} className={`ps-word ${HIGHLIGHT.has(w) ? "is-hl" : ""}`}>
              {w}{" "}
            </span>
          ))}
        </p>
      </div>

      <div className="problem-stats problem-stats--single">
        <article className="stat glass" data-reveal>
          <span className="mono stat-k">CITY OUTPUT · EST.</span>
          <div className="stat-v">
            <span className="stat-num" data-to="5000">
              0
            </span>
            <span className="stat-unit">+ t/day</span>
          </div>
          <p>Estimated municipal solid waste generated across Bengaluru every single day.</p>
        </article>
      </div>

      <div className="trail" aria-hidden="true">
        <svg viewBox="0 0 1200 220" preserveAspectRatio="none" className="trail-svg">
          <path className="trail-path" pathLength={1} d="M40 150 C 260 150, 300 60, 520 70 S 820 170, 1010 120" />
          <path className="trail-path trail-path--ghost" pathLength={1} d="M1010 120 C 1080 100, 1120 90, 1170 80" />
        </svg>
        <div className="trail-node" style={{ left: "3%", top: "68%" }}>
          <i /> <span className="mono">YOUR DOOR</span>
        </div>
        <div className="trail-node" style={{ left: "43%", top: "31%" }}>
          <i /> <span className="mono">THE TRUCK</span>
        </div>
        <div className="trail-node trail-node--void" style={{ left: "84%", top: "54%" }}>
          <i /> <span className="mono">??? — TRAIL GOES COLD</span>
        </div>
      </div>
    </section>
  );
}
