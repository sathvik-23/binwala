"use client";

import { useEffect, useRef, useState } from "react";
import { bus } from "@/lib/city/bus";

const clamp = (v: number) => Math.max(0, Math.min(1, v));

function webglOK() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function CityCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (!webglOK()) {
      setFallback(true);
      bus.ready = true;
      bus.readyListeners.forEach((f) => f());
      return;
    }

    let scene: import("@/lib/city/scene").CityScene | null = null;
    let cancelled = false;
    const mobile = window.matchMedia("(max-width: 760px), (pointer: coarse)").matches;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    import("@/lib/city/scene").then(({ CityScene }) => {
      if (cancelled) return;
      try {
        scene = new CityScene(canvas, { mobile, reducedMotion });
        update();
        scene.start();
        requestAnimationFrame(() => {
          bus.ready = true;
          bus.readyListeners.forEach((f) => f());
        });
      } catch (e) {
        console.warn("WebGL city failed, using fallback", e);
        setFallback(true);
        bus.ready = true;
        bus.readyListeners.forEach((f) => f());
      }
    });

    let lastVisible = true;
    const update = () => {
      const vh = window.innerHeight;
      let best: { mode: typeof bus.mode; area: number } = { mode: "hidden", area: 0 };
      document.querySelectorAll<HTMLElement>("[data-city]").forEach((el) => {
        const r = el.getBoundingClientRect();
        const mode = el.dataset.city as typeof bus.mode;
        const area = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
        if (mode === "hero") bus.heroProgress = clamp(-r.top / r.height);
        if (mode === "network") bus.networkProgress = clamp((vh - r.top) / vh); // 0 entering → 1 fully in view
        if (mode === "finale") bus.finaleProgress = clamp((vh - r.top) / (r.height + vh));
        if (area > best.area) best = { mode, area };
      });
      // Only the transparent sections reveal the canvas. Opaque ones cover it.
      const cover = document.querySelectorAll<HTMLElement>("[data-cover]");
      let covered = false;
      cover.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top <= 0 && r.bottom >= vh) covered = true;
      });
      const signup = bus.signup.active;
      const isVisible = signup || (best.area > 4 && !covered);
      bus.mode = signup ? "signup" : isVisible ? best.mode : "hidden";
      if (isVisible !== lastVisible) {
        lastVisible = isVisible;
        setVisible(isVisible);
        if (isVisible) scene?.start();
        else scene?.stop();
      }
    };

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        update();
      });
    };
    const onPointer = (e: PointerEvent) => {
      bus.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      bus.pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("binwala:signup", onScroll);
    window.addEventListener("resize", onScroll);
    if (!mobile) window.addEventListener("pointermove", onPointer, { passive: true });
    update();

    return () => {
      cancelled = true;
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("binwala:signup", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("pointermove", onPointer);
      scene?.dispose();
    };
  }, []);

  return (
    <div className={`city ${visible ? "" : "is-hidden"} ${fallback ? "is-fallback" : ""}`} aria-hidden="true">
      <canvas ref={ref} className="city-canvas" />
      <div className="city-fallback" />
      <div className="city-shade" />
    </div>
  );
}
