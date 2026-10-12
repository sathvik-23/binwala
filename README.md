# Binwala — waitlist site

The future of waste collection, launching first in HSR Layout, Bengaluru. Next.js 16 + Postgres, a real-time WebGL city (Three.js), GSAP/Lenis motion, and a neighbourhood-based waitlist with referrals and an admin demand map.

## Deploy: GitHub → Vercel + Supabase

1. **Push to GitHub** (repo: `sathvik-23/binwala`): `git push -u origin main`
2. **Vercel** → Add New → Project → import `sathvik-23/binwala`. Framework is detected as Next.js; no build settings to change.
3. **Supabase** → in the Vercel project: Storage (or Integrations) → Supabase → Create / connect a database → connect it to this project. This sets `POSTGRES_URL` and friends automatically.
   *Already have a Supabase project?* Copy its connection string (Connect → Transaction pooler, port 6543) into a `DATABASE_URL` env var instead.
4. **Environment variables** in Vercel → Settings → Environment Variables:
   | Name | Value |
   |---|---|
   | `ADMIN_TOKEN` | long random string (opens `/admin?token=…`) |
   | `IP_HASH_SALT` | any random string |
   | `NEXT_PUBLIC_SITE_URL` | your domain, e.g. `https://binwala.com` (optional; defaults to the Vercel URL) |
5. **Redeploy.** Tables are created automatically on the first request, with Row Level Security switched on, so Supabase's public API keys can't read the signup list. Only the server (connecting as the database owner) can.

Every push to `main` redeploys.

## Run it locally

```bash
npm install
cp .env.example .env.local     # paste your Supabase connection string into DATABASE_URL (optional)
npm run dev                    # http://localhost:3000
```

With no database URL, dev mode stores signups in `.data/dev-store.json`. Production refuses to start without one.

## Welcome email (binwala@perfstaq.com)

Every completed signup gets a branded welcome email with their pass, details and WhatsApp share link. It's sent after the response, so signup never waits on it. Pick one:

- **Resend:** add `perfstaq.com` at resend.com/domains, put the DNS records it shows in perfstaq.com's DNS, then `vercel env add RESEND_API_KEY production`.
- **SMTP (the actual mailbox):** `vercel env add SMTP_HOST production` (e.g. `smtp.gmail.com`), `SMTP_PORT` `465`, `SMTP_USER` `binwala@perfstaq.com`, `SMTP_PASS` (an app password).

Optional `MAIL_NOTIFY_TO=binwala@perfstaq.com` sends you an alert per signup. Delivery status shows on `/admin`.

## Address search

Instant HSR street/sector/landmark matches come from `lib/hsr.ts` (no network). Building names come from Google Places when `GOOGLE_MAPS_API_KEY` is set, otherwise OpenStreetMap (Photon). Results are restricted to HSR Layout; anything outside is flagged and stored as "outside".

## What's inside

- **Hero / city** — `lib/city/scene.ts`. Procedural Bengaluru at night where only the HSR Layout launch zone is lit: dashed zone boundary, Binwala pods running inside it, and a beacon whose height grows with live HSR signups. Scroll camera: aerial hero → top-down on HSR (Launch zone section) → orbit at the final CTA. Auto-degrades on slow GPUs, falls back without WebGL, respects reduced motion.
- **Waitlist** — email + HSR sector (Sectors 1–7, "not sure", or "not in HSR"; bottom sheet on phones). `?ref=CODE&n=hsr-sector-2` links credit the referrer and prefill the area with an invite banner. Honeypot, rate limiting, same-origin check, duplicate-email handling (returns the existing pass).
- **Celebration** — confetti, holographic tilt "Waitlist Pass", neighbourhood milestone meter, WhatsApp-first sharing with the "Help bring Binwala to {area}" message, then an optional 20-second profile (resident type, apartment/community, household size, pain points).
- **Admin** — `/admin?token=…`: totals, 30-day chart, demand by HSR sector, top apartment communities, resident types, pain points, sources, top referrers, funnel events. CSV export (formula-injection safe).
- **Analytics** — first-party events in the `events` table (page/section views, form start, signup, shares, map clicks, FAQ).

## Before launch

- Replace `hello@binwala.com` in `components/Footer.tsx` with your real address.
- The 5,000+ t/day figure is a public estimate (cited in the footer). Pricing and dates are deliberately not mentioned anywhere.
- The rate limiter is in-memory per serverless instance, which is fine for a waitlist; turn on Vercel's Firewall/Attack Challenge if you get hammered.
