"use client";

import { useRef, useState } from "react";
import { useWaitlist } from "./WaitlistContext";
import { areaLabel } from "@/lib/neighbourhoods";
import { track } from "@/lib/track";
import { fmt } from "@/lib/format";

type Props = { variant: "hero" | "final"; idPrefix: string };

/** The page-level entry point: one field, then the full join flow takes over. */
export default function WaitlistForm({ variant, idPrefix }: Props) {
  const { openJoin, joined, setSuccessOpen, neighbourhood } = useWaitlist();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const started = useRef(false);

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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = email.trim();
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
      setError("That email doesn't look right.");
      setShake((s) => s + 1);
      return;
    }
    setError(null);
    track("join_open", { variant, prefilled: Boolean(v) });
    openJoin({ email: v || undefined, neighbourhood: neighbourhood || undefined });
  };

  return (
    <form className={`wform wform--${variant}`} onSubmit={submit} noValidate>
      <div key={shake} className={`wform-row glass ${shake ? "shake" : ""}`}>
        <label className="sr-only" htmlFor={`${idPrefix}-email`}>
          Email address
        </label>
        <input
          id={`${idPrefix}-email`}
          className={`wform-email ${error ? "is-invalid" : ""}`}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (!started.current) {
              started.current = true;
              track("form_start", { variant });
            }
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={`${idPrefix}-msg`}
        />
        <button className="btn btn--lime wform-submit magnetic" type="submit">
          <span className="btn-label">
            Join the Waitlist <span className="arrow">→</span>
          </span>
        </button>
      </div>
      <p id={`${idPrefix}-msg`} className={`wform-msg mono ${error ? "is-error" : ""}`} role="status" aria-live="polite">
        {error ?? "Takes 40 seconds. No spam, ever."}
      </p>
    </form>
  );
}
