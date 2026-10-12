"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Stats } from "@/lib/store";
import { setCounts, pulseNeighbourhood } from "@/lib/city/bus";
import { AREA_IDS } from "@/lib/neighbourhoods";

export type Joined = {
  email: string;
  referralCode: string;
  position: number;
  neighbourhood: string;
  neighbourhoodCount: number;
  referrals: number;
  alreadyJoined: boolean;
  joinedAt: string;
};

type Ctx = {
  stats: Stats;
  refreshStats: () => Promise<void>;
  neighbourhood: string;
  setNeighbourhood: (id: string) => void;
  joined: Joined | null;
  completeSignup: (j: Joined) => void;
  successOpen: boolean;
  setSuccessOpen: (v: boolean) => void;
  ref: string | null;
  utm: { source: string | null; medium: string | null; campaign: string | null };
  invitedTo: string | null;
  goToSignup: (neighbourhood?: string) => void;
};

const WaitlistCtx = createContext<Ctx | null>(null);
const LS_KEY = "binwala_joined_v1";

export function WaitlistProvider({ initialStats, children }: { initialStats: Stats; children: React.ReactNode }) {
  const [stats, setStats] = useState<Stats>(initialStats);
  const [neighbourhood, setNeighbourhoodState] = useState("");
  const [joined, setJoined] = useState<Joined | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [ref, setRef] = useState<string | null>(null);
  const [invitedTo, setInvitedTo] = useState<string | null>(null);
  const [utm, setUtm] = useState<Ctx["utm"]>({ source: null, medium: null, campaign: null });
  const statsRef = useRef(stats);
  statsRef.current = stats;

  useEffect(() => setCounts(stats.neighbourhoods), [stats]);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const r = q.get("ref");
    if (r && /^[A-Z0-9]{4,12}$/i.test(r)) {
      setRef(r.toUpperCase());
      try {
        localStorage.setItem("binwala_ref", r.toUpperCase());
      } catch {}
    } else {
      try {
        const saved = localStorage.getItem("binwala_ref");
        if (saved) setRef(saved);
      } catch {}
    }
    const n = q.get("n");
    if (n && AREA_IDS.has(n)) {
      setNeighbourhoodState(n);
      if (r) setInvitedTo(n);
    }
    setUtm({ source: q.get("utm_source"), medium: q.get("utm_medium"), campaign: q.get("utm_campaign") });
    try {
      const j = localStorage.getItem(LS_KEY);
      if (j) setJoined(JSON.parse(j));
    } catch {}
  }, []);

  const refreshStats = useCallback(async () => {
    try {
      const r = await fetch("/api/stats", { cache: "no-store" });
      if (r.ok) setStats(await r.json());
    } catch {}
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) refreshStats();
    }, 30_000);
    return () => clearInterval(id);
  }, [refreshStats]);

  const completeSignup = useCallback(
    (j: Joined) => {
      setJoined(j);
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(j));
      } catch {}
      pulseNeighbourhood(j.neighbourhood);
      // Optimistically light up the city before the stats refresh lands.
      if (!j.alreadyJoined) {
        const s = statsRef.current;
        const list = [...s.neighbourhoods];
        const i = list.findIndex((x) => x.id === j.neighbourhood);
        if (i >= 0) list[i] = { ...list[i], count: Math.max(list[i].count + 1, j.neighbourhoodCount) };
        else list.push({ id: j.neighbourhood, count: j.neighbourhoodCount });
        list.sort((a, b) => b.count - a.count);
        setStats({ ...s, total: Math.max(s.total + 1, j.position), neighbourhoods: list });
      }
      setSuccessOpen(true);
      setTimeout(refreshStats, 1500);
    },
    [refreshStats],
  );

  const goToSignup = useCallback((n?: string) => {
    if (n) setNeighbourhoodState(n);
    const el = document.getElementById("join");
    if (!el) return;
    const lenis = (window as unknown as { __lenis?: { scrollTo: (t: Element, o?: object) => void } }).__lenis;
    if (lenis) lenis.scrollTo(el, { offset: -40, duration: 1.6 });
    else el.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => (document.getElementById("join-email") as HTMLInputElement | null)?.focus({ preventScroll: true }), 1300);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      stats,
      refreshStats,
      neighbourhood,
      setNeighbourhood: setNeighbourhoodState,
      joined,
      completeSignup,
      successOpen,
      setSuccessOpen,
      ref,
      utm,
      invitedTo,
      goToSignup,
    }),
    [stats, refreshStats, neighbourhood, joined, completeSignup, successOpen, ref, utm, invitedTo, goToSignup],
  );

  return <WaitlistCtx.Provider value={value}>{children}</WaitlistCtx.Provider>;
}

export function useWaitlist() {
  const c = useContext(WaitlistCtx);
  if (!c) throw new Error("useWaitlist outside provider");
  return c;
}
