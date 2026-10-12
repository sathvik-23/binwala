"use client";

import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { useWaitlist } from "./WaitlistContext";
import { fmt } from "@/lib/format";
import { CountUp } from "./CountUp";

const LINKS = [
  { href: "#problem", label: "Problem" },
  { href: "#system", label: "How it works" },
  { href: "#network", label: "HSR Layout" },
  { href: "#faq", label: "FAQ" },
];

export default function Nav() {
  const { stats, joined, goToSignup, setSuccessOpen } = useWaitlist();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    const on = () => {
      const y = window.scrollY;
      setScrolled(y > 40);
      setHidden(y > last + 4 && y > 600);
      if (y < last - 4) setHidden(false);
      last = y;
    };
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const jump = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    const el = document.querySelector(href);
    if (!el) return;
    e.preventDefault();
    const lenis = (window as unknown as { __lenis?: { scrollTo: (t: Element, o?: object) => void } }).__lenis;
    if (lenis) lenis.scrollTo(el, { duration: 1.4 });
    else el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <header className={`nav ${scrolled ? "is-scrolled" : ""} ${hidden ? "is-hidden" : ""}`}>
      <a href="#top" className="nav-logo" aria-label="Binwala home" onClick={(e) => jump(e, "#top")}>
        <Logo />
      </a>
      <nav className="nav-links" aria-label="Sections">
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} onClick={(e) => jump(e, l.href)} className="nav-link">
            <span>{l.label}</span>
            <span aria-hidden="true">{l.label}</span>
          </a>
        ))}
      </nav>
      <div className="nav-right">
        <div className="live-pill mono" title="People on the Binwala waitlist">
          <span className="live-dot" />
          {stats.total > 0 ? (
            <>
              <CountUp value={stats.total} format={fmt} /> <span className="hide-sm">on the list</span>
            </>
          ) : (
            <span>WAITLIST OPEN</span>
          )}
        </div>
        {joined ? (
          <button className="btn btn--sm btn--ghost" onClick={() => setSuccessOpen(true)}>
            Your pass
          </button>
        ) : (
          <button className="btn btn--sm btn--lime magnetic" onClick={() => goToSignup()}>
            Join<span className="hide-sm">&nbsp;the waitlist</span>
          </button>
        )}
      </div>
    </header>
  );
}
