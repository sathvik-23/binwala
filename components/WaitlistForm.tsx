"use client";

import { useEffect, useRef, useState } from "react";
import NeighbourhoodPicker from "./NeighbourhoodPicker";
import { useWaitlist } from "./WaitlistContext";
import { areaLabel } from "@/lib/neighbourhoods";
import { track } from "@/lib/track";
import { fmt } from "@/lib/format";

type Props = { variant: "hero" | "final"; idPrefix: string };

export default function WaitlistForm({ variant, idPrefix }: Props) {
  const { neighbourhood, setNeighbourhood, completeSignup, ref, utm, joined, setSuccessOpen } = useWaitlist();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<{ msg: string; field?: string } | null>(null);
  const [shake, setShake] = useState(0);
  const started = useRef(false);
  const honey = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (error) setShake((s) => s + 1);
  }, [error]);

  if (joined) {
    return (
      <div className={`joined-card glass joined-card--${variant}`}>
        <div className="joined-card-l">
          <span className="mono tag tag--lime">● YOU&apos;RE ON THE LIST</span>
          <p>
            <strong>#{fmt(joined.position)}</strong> on the list · {areaLabel(joined.neighbourhood)}
          </p>
        </div>
        <button className="btn btn--lime" onClick={() => setSuccessOpen(true)}>
          Share your pass <span className="arrow">→</span>
        </button>
      </div>
    );
  }

  const onFirstInput = () => {
    if (started.current) return;
    started.current = true;
    track("form_start", { variant });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "loading") return;
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setError({ msg: "Enter a valid email so we can reach you.", field: "email" });
      return;
    }
    if (!neighbourhood) {
      setError({ msg: "Pick your HSR sector so we can plan routes street by street.", field: "neighbourhood" });
      return;
    }
    setStatus("loading");
    try {
      const r = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          neighbourhood,
          ref,
          utm,
          company: honey.current?.value || undefined,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setStatus("error");
        setError({ msg: data.error ?? "Something went wrong. Try again?", field: data.field });
        track("signup_error", { variant, status: r.status });
        return;
      }
      track("signup_success", { variant, neighbourhood, referred: Boolean(ref), already: Boolean(data.alreadyJoined) });
      setStatus("idle");
      completeSignup({ ...data, email: email.trim(), joinedAt: new Date().toISOString() });
    } catch {
      setStatus("error");
      setError({ msg: "You seem to be offline. Try again in a moment." });
    }
  };

  return (
    <form className={`wform wform--${variant}`} onSubmit={submit} noValidate onInput={onFirstInput}>
      <div key={shake} className={`wform-row glass ${shake ? "shake" : ""}`}>
        <label className="sr-only" htmlFor={`${idPrefix}-email`}>
          Email address
        </label>
        <input
          id={`${idPrefix}-email`}
          className={`wform-email ${error?.field === "email" ? "is-invalid" : ""}`}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onFocus={() => variant === "hero" && track("hero_cta_focus")}
          aria-invalid={error?.field === "email"}
          aria-describedby={`${idPrefix}-msg`}
          required
        />
        <span className="wform-divider" aria-hidden="true" />
        <label className="sr-only" htmlFor={`${idPrefix}-hood`}>
          HSR sector
        </label>
        <NeighbourhoodPicker id={`${idPrefix}-hood`} value={neighbourhood} onChange={setNeighbourhood} invalid={error?.field === "neighbourhood"} />
        <button className={`btn btn--lime wform-submit magnetic ${status === "loading" ? "is-loading" : ""}`} type="submit" disabled={status === "loading"}>
          <span className="btn-label">
            {status === "loading" ? "Securing your spot" : "Join the Waitlist"} <span className="arrow">→</span>
          </span>
          <span className="btn-spinner" aria-hidden="true" />
        </button>
        <input ref={honey} type="text" name="company" tabIndex={-1} autoComplete="off" className="hp" aria-hidden="true" />
      </div>

      <p id={`${idPrefix}-msg`} className={`wform-msg mono ${error ? "is-error" : ""}`} role="status" aria-live="polite">
        {error ? error.msg : "No spam. Just a cleaner future."}
      </p>
    </form>
  );
}
