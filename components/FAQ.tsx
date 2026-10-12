"use client";

import { useState } from "react";
import { track } from "@/lib/track";

const QA = [
  {
    q: "When does Binwala launch?",
    a: "We're launching in HSR Layout first, sector by sector, starting where waitlist demand is strongest. We'll email you before pickups begin on your street. No dates until we're sure we can deliver.",
  },
  {
    q: "How much will it cost?",
    a: "Joining the waitlist is free and there's nothing to pay. We'll share pricing well before the pilot, once we've validated the operations. No card, no commitment.",
  },
  {
    q: "I don't live in HSR Layout. Can I still join?",
    a: "Yes. Choose \"I'm not in HSR Layout\" when you sign up. We're focused on HSR for now, and you'll hear from us the moment that changes.",
  },
  {
    q: "What happens to my data?",
    a: "We use your email and neighbourhood to plan the pilot and tell you when we launch. We never sell your data. Every email has a one-click unsubscribe.",
  },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="faq" id="faq" data-cover>
      <div className="faq-inner">
        <div className="faq-left">
          <div className="section-label mono">
            <span>05</span> / QUESTIONS
          </div>
          <h2 className="h2" data-reveal>
            The fine print,
            <br />
            <span className="text-dim">without the fine print.</span>
          </h2>
        </div>
        <div className="faq-list">
          {QA.map((x, i) => (
            <div key={i} className={`faq-item ${open === i ? "is-open" : ""}`} data-reveal>
              <button
                className="faq-q"
                aria-expanded={open === i}
                aria-controls={`faq-a-${i}`}
                onClick={() => {
                  setOpen(open === i ? null : i);
                  if (open !== i) track("faq_open", { q: i });
                }}
              >
                <span className="mono faq-n">{String(i + 1).padStart(2, "0")}</span>
                <span className="faq-qt">{x.q}</span>
                <span className="faq-plus" aria-hidden="true" />
              </button>
              <div className="faq-a" id={`faq-a-${i}`} role="region">
                <div>
                  <p>{x.a}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
