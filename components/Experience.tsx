"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { track } from "@/lib/track";

const CityCanvas = dynamic(() => import("./CityCanvas"), { ssr: false });

export default function Experience() {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    let lenis: Lenis | null = null;
    const tick = (time: number) => lenis?.raf(time * 1000);

    if (!reduce && !touch) {
      lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.95 });
      (window as unknown as { __lenis?: Lenis }).__lenis = lenis;
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
    }

    // Reveal-on-scroll for anything marked data-reveal
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    const observe = () => document.querySelectorAll("[data-reveal]:not(.is-in)").forEach((el) => io.observe(el));
    observe();
    const mo = new MutationObserver(observe);
    mo.observe(document.body, { childList: true, subtree: true });

    // Section-level analytics
    const seen = new Set<string>();
    const sio = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).id;
          if (e.isIntersecting && id && !seen.has(id)) {
            seen.add(id);
            track("section_view", { id });
          }
        }
      },
      { threshold: 0.35 },
    );
    document.querySelectorAll("section[id]").forEach((s) => sio.observe(s));
    track("page_view", { ref: new URLSearchParams(location.search).get("ref") ?? "" });

    // Magnetic buttons
    const mags = new WeakMap<Element, boolean>();
    const onMove = (e: PointerEvent) => {
      const t = (e.target as Element)?.closest?.(".magnetic") as HTMLElement | null;
      document.querySelectorAll<HTMLElement>(".magnetic.is-mag").forEach((m) => {
        if (m !== t) {
          m.classList.remove("is-mag");
          m.style.transform = "";
        }
      });
      if (!t || touch || reduce) return;
      const r = t.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2);
      const y = e.clientY - (r.top + r.height / 2);
      t.classList.add("is-mag");
      mags.set(t, true);
      t.style.transform = `translate(${x * 0.18}px, ${y * 0.28}px)`;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    // Recalculate pins after fonts load
    document.fonts?.ready.then(() => ScrollTrigger.refresh());

    return () => {
      io.disconnect();
      sio.disconnect();
      mo.disconnect();
      window.removeEventListener("pointermove", onMove);
      gsap.ticker.remove(tick);
      lenis?.destroy();
    };
  }, []);

  return <CityCanvas />;
}
