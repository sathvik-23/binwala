"use client";

import WaitlistForm from "./WaitlistForm";
import { useWaitlist } from "./WaitlistContext";
import { fmt } from "@/lib/format";
import { OUTSIDE } from "@/lib/neighbourhoods";

export default function FinalCTA() {
  const { stats } = useWaitlist();
  const hsr = stats.neighbourhoods.filter((n) => n.id !== OUTSIDE).reduce((a, n) => a + n.count, 0);
  return (
    <section className="final" id="join" data-city="finale">
      <div className="final-inner">
        <div className="section-label mono">
          <span>06</span> / JOIN
        </div>
        <h2 className="final-h" data-reveal>
          Bring Binwala
          <br />
          to <span className="text-lime">your street.</span>
        </h2>
        <p className="lead final-lead" data-reveal>
          {hsr > 0 ? (
            <>
              Join <b>{fmt(hsr)}</b> HSR neighbours. The busiest sectors get pickups first.
            </>
          ) : (
            <>Be one of the first in HSR Layout. The busiest sectors get pickups first.</>
          )}
        </p>
        <div className="final-form" data-reveal>
          <WaitlistForm variant="final" idPrefix="join" />
        </div>
      </div>
    </section>
  );
}
