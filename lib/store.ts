import "server-only";
import { Pool } from "pg";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type SignupInput = {
  email: string;
  name: string;
  phone: string; // +91XXXXXXXXXX
  neighbourhood: string; // hsr-sector-N | hsr-unsure | outside
  addressTitle: string; // building / street the person picked
  addressLine: string; // rest of the address
  placeId?: string | null;
  lat?: number | null;
  lng?: number | null;
  inHsr: boolean;
  flat?: string | null;
  dumpsPerDay: number;
  pickupSlot: string;
  referredBy?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
};

export type DraftInput = { email: string; name?: string | null; phone?: string | null; step: number; data?: Record<string, unknown> };

export type SignupResult = {
  referralCode: string;
  position: number;
  neighbourhood: string;
  neighbourhoodCount: number;
  referrals: number;
  alreadyJoined: boolean;
  name: string | null;
};

export type Stats = {
  total: number;
  neighbourhoods: { id: string; count: number }[];
  recent: { neighbourhood: string; at: string }[];
};

export type AdminData = {
  total: number;
  today: number;
  week: number;
  byNeighbourhood: { id: string; count: number; referred: number }[];
  bySlot: { id: string; count: number }[];
  byDumps: { id: string; count: number }[];
  avgDumps: number | null;
  topBuildings: { building: string; count: number }[];
  topReferrers: { code: string; neighbourhood: string; referrals: number }[];
  bySource: { source: string; count: number }[];
  daily: { day: string; count: number }[];
  funnel: { name: string; count: number }[];
  drafts: { started: number; finished: number; abandoned: number; byStep: { step: number; count: number }[] };
  pins: { lat: number; lng: number; slot: string | null }[];
  emails: { sent: number; failed: number; skipped: number };
};

export type Row = {
  id: number;
  created_at: string;
  name: string | null;
  email: string;
  phone: string | null;
  neighbourhood: string;
  address_title: string | null;
  address_line: string | null;
  flat: string | null;
  lat: number | null;
  lng: number | null;
  in_hsr: boolean | null;
  dumps_per_day: number | null;
  pickup_slot: string | null;
  referral_code: string;
  referred_by: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  email_status: string | null;
};

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export function makeCode(len = 7) {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

interface Store {
  signup(input: SignupInput): Promise<SignupResult>;
  saveDraft(d: DraftInput): Promise<void>;
  markEmail(code: string, status: "sent" | "failed" | "skipped"): Promise<void>;
  stats(): Promise<Stats>;
  track(name: string, props: Record<string, unknown>, pathName: string | null, sessionId: string | null): Promise<void>;
  admin(): Promise<AdminData>;
  exportRows(): Promise<Row[]>;
}

/* ------------------------------------------------------------------ */
/* Postgres (Supabase)                                                 */
/* ------------------------------------------------------------------ */

const g = globalThis as unknown as { __binwalaPool?: Pool; __binwalaSchema?: Promise<void> };

// Idempotent: safe to run on every cold start. Keep in sync with db/schema.sql.
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS signups (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  email_norm TEXT NOT NULL UNIQUE,
  neighbourhood TEXT NOT NULL,
  neighbourhood_other TEXT,
  resident_type TEXT,
  community TEXT,
  household_size SMALLINT,
  pain_points TEXT[],
  referral_code TEXT NOT NULL UNIQUE,
  referred_by TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE signups ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE signups ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE signups ADD COLUMN IF NOT EXISTS address_title TEXT;
ALTER TABLE signups ADD COLUMN IF NOT EXISTS address_line TEXT;
ALTER TABLE signups ADD COLUMN IF NOT EXISTS place_id TEXT;
ALTER TABLE signups ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE signups ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
ALTER TABLE signups ADD COLUMN IF NOT EXISTS in_hsr BOOLEAN;
ALTER TABLE signups ADD COLUMN IF NOT EXISTS flat TEXT;
ALTER TABLE signups ADD COLUMN IF NOT EXISTS dumps_per_day SMALLINT;
ALTER TABLE signups ADD COLUMN IF NOT EXISTS pickup_slot TEXT;
ALTER TABLE signups ADD COLUMN IF NOT EXISTS email_status TEXT;
ALTER TABLE signups ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS signups_neighbourhood_idx ON signups (neighbourhood);
CREATE INDEX IF NOT EXISTS signups_referred_by_idx ON signups (referred_by);
CREATE INDEX IF NOT EXISTS signups_created_at_idx ON signups (created_at DESC);

CREATE TABLE IF NOT EXISTS waitlist_drafts (
  email_norm TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  step SMALLINT NOT NULL DEFAULT 1,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  props JSONB NOT NULL DEFAULT '{}'::jsonb,
  path TEXT,
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_name_created_idx ON events (name, created_at DESC);

-- Supabase exposes the public schema over its REST API. RLS with no policies blocks the
-- anon/authenticated keys from reading names, phones and addresses; the server connects as the owner.
ALTER TABLE signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
`;

/** DATABASE_URL, or POSTGRES_URL as set by the Vercel ↔ Supabase integration. */
export function dbUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
}

/** Hosted Postgres (Supabase, Neon…) needs TLS; node-pg treats sslmode=require as strict verification, so handle it here. */
export function pgConfig() {
  const raw = dbUrl();
  const needsSsl = process.env.DATABASE_SSL === "true" || /supabase\.(co|com)|sslmode=/.test(raw);
  let connectionString = raw;
  try {
    const u = new URL(raw);
    u.searchParams.delete("sslmode");
    u.searchParams.delete("supa");
    connectionString = u.toString();
  } catch {}
  return { connectionString, ssl: needsSsl ? { rejectUnauthorized: false } : undefined };
}

function pool() {
  if (!g.__binwalaPool) {
    g.__binwalaPool = new Pool({
      ...pgConfig(),
      max: process.env.VERCEL ? 2 : 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
    });
  }
  return g.__binwalaPool;
}

async function ensureSchema() {
  if (!g.__binwalaSchema) {
    g.__binwalaSchema = pool()
      .query(SCHEMA_SQL)
      .then(() => undefined)
      .catch((e) => {
        g.__binwalaSchema = undefined;
        throw e;
      });
  }
  return g.__binwalaSchema;
}

async function q(text: string, params?: unknown[]) {
  await ensureSchema();
  return pool().query(text, params);
}

class PgStore implements Store {
  private async summary(code: string, neighbourhood: string, id: number) {
    const { rows } = await q(
      `SELECT
         (SELECT count(*) FROM signups WHERE id <= $1)::int AS position,
         (SELECT count(*) FROM signups WHERE neighbourhood = $2)::int AS ncount,
         (SELECT count(*) FROM signups WHERE referred_by = $3)::int AS referrals`,
      [id, neighbourhood, code],
    );
    return rows[0] as { position: number; ncount: number; referrals: number };
  }

  async signup(input: SignupInput): Promise<SignupResult> {
    const norm = input.email.trim().toLowerCase();
    const existing = await q(`SELECT id, referral_code, neighbourhood, name FROM signups WHERE email_norm = $1`, [norm]);
    if (existing.rows[0]) {
      const r = existing.rows[0];
      const s = await this.summary(r.referral_code, r.neighbourhood, Number(r.id));
      return { referralCode: r.referral_code, position: s.position, neighbourhood: r.neighbourhood, neighbourhoodCount: s.ncount, referrals: s.referrals, alreadyJoined: true, name: r.name };
    }

    let referredBy: string | null = null;
    if (input.referredBy) {
      const ref = await q(`SELECT 1 FROM signups WHERE referral_code = $1`, [input.referredBy]);
      if (ref.rowCount) referredBy = input.referredBy;
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = makeCode();
      try {
        const { rows } = await q(
          `INSERT INTO signups (email, email_norm, name, phone, neighbourhood, address_title, address_line, place_id, lat, lng,
                                in_hsr, flat, dumps_per_day, pickup_slot, referral_code, referred_by,
                                utm_source, utm_medium, utm_campaign, ip_hash, user_agent)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
           ON CONFLICT (email_norm) DO NOTHING
           RETURNING id`,
          [
            input.email.trim(), norm, input.name, input.phone, input.neighbourhood, input.addressTitle, input.addressLine,
            input.placeId ?? null, input.lat ?? null, input.lng ?? null, input.inHsr, input.flat ?? null,
            input.dumpsPerDay, input.pickupSlot, code, referredBy,
            input.utmSource ?? null, input.utmMedium ?? null, input.utmCampaign ?? null, input.ipHash ?? null,
            input.userAgent?.slice(0, 300) ?? null,
          ],
        );
        if (!rows[0]) return this.signup(input); // raced with the same email
        await q(`UPDATE waitlist_drafts SET completed = true, updated_at = now() WHERE email_norm = $1`, [norm]);
        const s = await this.summary(code, input.neighbourhood, Number(rows[0].id));
        return { referralCode: code, position: s.position, neighbourhood: input.neighbourhood, neighbourhoodCount: s.ncount, referrals: 0, alreadyJoined: false, name: input.name };
      } catch (e: unknown) {
        const err = e as { code?: string; constraint?: string };
        if (err.code === "23505" && err.constraint?.includes("referral_code")) continue;
        throw e;
      }
    }
    throw new Error("could not allocate referral code");
  }

  async saveDraft(d: DraftInput) {
    await q(
      `INSERT INTO waitlist_drafts (email_norm, email, name, phone, step, data)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (email_norm) DO UPDATE SET
         name = COALESCE(EXCLUDED.name, waitlist_drafts.name),
         phone = COALESCE(EXCLUDED.phone, waitlist_drafts.phone),
         step = GREATEST(EXCLUDED.step, waitlist_drafts.step),
         data = waitlist_drafts.data || EXCLUDED.data,
         updated_at = now()
       WHERE waitlist_drafts.completed = false`,
      [d.email.trim().toLowerCase(), d.email.trim(), d.name ?? null, d.phone ?? null, d.step, JSON.stringify(d.data ?? {})],
    );
  }

  async markEmail(code: string, status: "sent" | "failed" | "skipped") {
    await q(`UPDATE signups SET email_status = $2, email_sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE email_sent_at END WHERE referral_code = $1`, [code, status]);
  }

  async stats(): Promise<Stats> {
    const [t, n, r] = await Promise.all([
      q(`SELECT count(*)::int AS c FROM signups`),
      q(`SELECT neighbourhood AS id, count(*)::int AS count FROM signups GROUP BY 1 ORDER BY 2 DESC`),
      q(`SELECT neighbourhood, created_at AS at FROM signups ORDER BY id DESC LIMIT 8`),
    ]);
    return {
      total: t.rows[0].c,
      neighbourhoods: n.rows,
      recent: r.rows.map((x) => ({ neighbourhood: x.neighbourhood, at: new Date(x.at).toISOString() })),
    };
  }

  async track(name: string, props: Record<string, unknown>, pathName: string | null, sessionId: string | null) {
    await q(`INSERT INTO events (name, props, path, session_id) VALUES ($1,$2,$3,$4)`, [name, JSON.stringify(props), pathName, sessionId]);
  }

  async admin(): Promise<AdminData> {
    const rows = (sql: string) => q(sql).then((r) => r.rows);
    const [totals, byN, bySlot, byDumps, buildings, refs, src, daily, funnel, drafts, draftSteps, pins, emails] = await Promise.all([
      rows(`SELECT count(*)::int AS total,
                count(*) FILTER (WHERE created_at > now() - interval '1 day')::int AS today,
                count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS week,
                round(avg(dumps_per_day)::numeric, 1)::float AS avg_dumps
         FROM signups`),
      rows(`SELECT neighbourhood AS id, count(*)::int AS count, count(referred_by)::int AS referred FROM signups GROUP BY 1 ORDER BY 2 DESC`),
      rows(`SELECT COALESCE(pickup_slot,'unknown') AS id, count(*)::int AS count FROM signups GROUP BY 1 ORDER BY 2 DESC`),
      rows(`SELECT COALESCE(dumps_per_day::text,'unknown') AS id, count(*)::int AS count FROM signups GROUP BY 1 ORDER BY 1`),
      rows(`SELECT address_title AS building, count(*)::int AS count FROM signups
            WHERE address_title IS NOT NULL AND address_title <> '' GROUP BY lower(address_title), address_title ORDER BY 2 DESC LIMIT 25`),
      rows(`SELECT s.referral_code AS code, s.neighbourhood, count(r.id)::int AS referrals
            FROM signups s JOIN signups r ON r.referred_by = s.referral_code GROUP BY 1,2 ORDER BY 3 DESC LIMIT 15`),
      rows(`SELECT COALESCE(utm_source, CASE WHEN referred_by IS NOT NULL THEN 'referral' ELSE 'direct' END) AS source,
                count(*)::int AS count FROM signups GROUP BY 1 ORDER BY 2 DESC`),
      rows(`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, count(*)::int AS count
            FROM signups WHERE created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 1`),
      rows(`SELECT name, count(DISTINCT COALESCE(session_id, id::text))::int AS count FROM events
            WHERE created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 2 DESC`),
      rows(`SELECT count(*)::int AS started, count(*) FILTER (WHERE completed)::int AS finished,
                   count(*) FILTER (WHERE NOT completed AND updated_at < now() - interval '30 minutes')::int AS abandoned
            FROM waitlist_drafts`),
      rows(`SELECT step::int, count(*)::int AS count FROM waitlist_drafts WHERE NOT completed GROUP BY 1 ORDER BY 1`),
      rows(`SELECT lat, lng, pickup_slot AS slot FROM signups WHERE lat IS NOT NULL AND lng IS NOT NULL ORDER BY id DESC LIMIT 2000`),
      rows(`SELECT count(*) FILTER (WHERE email_status='sent')::int AS sent, count(*) FILTER (WHERE email_status='failed')::int AS failed,
                   count(*) FILTER (WHERE email_status='skipped')::int AS skipped FROM signups`),
    ]);
    return {
      total: totals[0].total,
      today: totals[0].today,
      week: totals[0].week,
      avgDumps: totals[0].avg_dumps,
      byNeighbourhood: byN,
      bySlot,
      byDumps,
      topBuildings: buildings,
      topReferrers: refs,
      bySource: src,
      daily,
      funnel,
      drafts: { ...drafts[0], byStep: draftSteps },
      pins,
      emails: emails[0],
    };
  }

  async exportRows(): Promise<Row[]> {
    const { rows } = await q(
      `SELECT id, created_at, name, email, phone, neighbourhood, address_title, address_line, flat, lat, lng, in_hsr,
              dumps_per_day, pickup_slot, referral_code, referred_by, utm_source, utm_medium, utm_campaign, email_status
       FROM signups ORDER BY id`,
    );
    return rows;
  }
}

/* ------------------------------------------------------------------ */
/* Dev fallback: JSON file. Only used when no database URL is set.     */
/* ------------------------------------------------------------------ */

type DevDb = {
  signups: (Row & { email_norm: string })[];
  drafts: Record<string, { step: number; completed: boolean; updated_at: string }>;
  events: { name: string; props: unknown; path: string | null; session_id: string | null; created_at: string }[];
};
const DEV_FILE = path.join(process.cwd(), ".data", "dev-store.json");

class JsonStore implements Store {
  private async load(): Promise<DevDb> {
    try {
      const d = JSON.parse(await fs.readFile(DEV_FILE, "utf8"));
      return { signups: d.signups ?? [], drafts: d.drafts ?? {}, events: d.events ?? [] };
    } catch {
      return { signups: [], drafts: {}, events: [] };
    }
  }
  private async save(db: DevDb) {
    await fs.mkdir(path.dirname(DEV_FILE), { recursive: true });
    await fs.writeFile(DEV_FILE, JSON.stringify(db, null, 2));
  }
  private summary(db: DevDb, r: DevDb["signups"][number], alreadyJoined: boolean): SignupResult {
    return {
      referralCode: r.referral_code,
      position: db.signups.filter((s) => s.id <= r.id).length,
      neighbourhood: r.neighbourhood,
      neighbourhoodCount: db.signups.filter((s) => s.neighbourhood === r.neighbourhood).length,
      referrals: db.signups.filter((s) => s.referred_by === r.referral_code).length,
      alreadyJoined,
      name: r.name,
    };
  }
  async signup(input: SignupInput) {
    const db = await this.load();
    const norm = input.email.trim().toLowerCase();
    const found = db.signups.find((s) => s.email_norm === norm);
    if (found) return this.summary(db, found, true);
    let code = makeCode();
    while (db.signups.some((s) => s.referral_code === code)) code = makeCode();
    const row: DevDb["signups"][number] = {
      id: (db.signups.at(-1)?.id ?? 0) + 1,
      created_at: new Date().toISOString(),
      name: input.name,
      email: input.email.trim(),
      email_norm: norm,
      phone: input.phone,
      neighbourhood: input.neighbourhood,
      address_title: input.addressTitle,
      address_line: input.addressLine,
      flat: input.flat ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      in_hsr: input.inHsr,
      dumps_per_day: input.dumpsPerDay,
      pickup_slot: input.pickupSlot,
      referral_code: code,
      referred_by: db.signups.some((s) => s.referral_code === input.referredBy) ? input.referredBy! : null,
      utm_source: input.utmSource ?? null,
      utm_medium: input.utmMedium ?? null,
      utm_campaign: input.utmCampaign ?? null,
      email_status: null,
    };
    db.signups.push(row);
    if (db.drafts[norm]) db.drafts[norm].completed = true;
    await this.save(db);
    return this.summary(db, row, false);
  }
  async saveDraft(d: DraftInput) {
    const db = await this.load();
    const k = d.email.trim().toLowerCase();
    const prev = db.drafts[k];
    if (prev?.completed) return;
    db.drafts[k] = { step: Math.max(d.step, prev?.step ?? 0), completed: false, updated_at: new Date().toISOString() };
    await this.save(db);
  }
  async markEmail(code: string, status: "sent" | "failed" | "skipped") {
    const db = await this.load();
    const r = db.signups.find((s) => s.referral_code === code);
    if (r) r.email_status = status;
    await this.save(db);
  }
  async stats(): Promise<Stats> {
    const db = await this.load();
    const counts = new Map<string, number>();
    for (const s of db.signups) counts.set(s.neighbourhood, (counts.get(s.neighbourhood) ?? 0) + 1);
    return {
      total: db.signups.length,
      neighbourhoods: [...counts].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count),
      recent: db.signups.slice(-8).reverse().map((s) => ({ neighbourhood: s.neighbourhood, at: s.created_at })),
    };
  }
  async track(name: string, props: Record<string, unknown>, pathName: string | null, sessionId: string | null) {
    const db = await this.load();
    db.events.push({ name, props, path: pathName, session_id: sessionId, created_at: new Date().toISOString() });
    if (db.events.length > 5000) db.events = db.events.slice(-5000);
    await this.save(db);
  }
  async admin(): Promise<AdminData> {
    const db = await this.load();
    const now = Date.now();
    const tally = <T,>(items: T[], key: (t: T) => string | null | undefined) => {
      const m = new Map<string, number>();
      for (const i of items) {
        const k = key(i);
        if (k) m.set(k, (m.get(k) ?? 0) + 1);
      }
      return [...m].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count);
    };
    const S = db.signups;
    const D = Object.values(db.drafts);
    const dumps = S.map((s) => s.dumps_per_day).filter((x): x is number => typeof x === "number");
    return {
      total: S.length,
      today: S.filter((s) => now - +new Date(s.created_at) < 864e5).length,
      week: S.filter((s) => now - +new Date(s.created_at) < 7 * 864e5).length,
      avgDumps: dumps.length ? Math.round((dumps.reduce((a, b) => a + b, 0) / dumps.length) * 10) / 10 : null,
      byNeighbourhood: tally(S, (s) => s.neighbourhood).map((x) => ({ ...x, referred: S.filter((s) => s.neighbourhood === x.id && s.referred_by).length })),
      bySlot: tally(S, (s) => s.pickup_slot ?? "unknown"),
      byDumps: tally(S, (s) => String(s.dumps_per_day ?? "unknown")).sort((a, b) => a.id.localeCompare(b.id)),
      topBuildings: tally(S, (s) => s.address_title).map((x) => ({ building: x.id, count: x.count })),
      topReferrers: tally(S, (s) => s.referred_by).map((x) => ({ code: x.id, neighbourhood: S.find((s) => s.referral_code === x.id)?.neighbourhood ?? "", referrals: x.count })),
      bySource: tally(S, (s) => s.utm_source ?? (s.referred_by ? "referral" : "direct")).map((x) => ({ source: x.id, count: x.count })),
      daily: tally(S, (s) => s.created_at.slice(0, 10)).map((x) => ({ day: x.id, count: x.count })).sort((a, b) => a.day.localeCompare(b.day)),
      funnel: tally(db.events, (e) => e.name).map((x) => ({ name: x.id, count: x.count })),
      drafts: {
        started: D.length,
        finished: D.filter((d) => d.completed).length,
        abandoned: D.filter((d) => !d.completed && now - +new Date(d.updated_at) > 30 * 60_000).length,
        byStep: tally(D.filter((d) => !d.completed), (d) => String(d.step)).map((x) => ({ step: Number(x.id), count: x.count })),
      },
      pins: S.filter((s) => s.lat && s.lng).map((s) => ({ lat: s.lat!, lng: s.lng!, slot: s.pickup_slot })),
      emails: {
        sent: S.filter((s) => s.email_status === "sent").length,
        failed: S.filter((s) => s.email_status === "failed").length,
        skipped: S.filter((s) => s.email_status === "skipped").length,
      },
    };
  }
  async exportRows() {
    return (await this.load()).signups;
  }
}

/* ------------------------------------------------------------------ */

let _store: Store | null = null;
export function store(): Store {
  if (_store) return _store;
  if (dbUrl()) {
    _store = new PgStore();
  } else {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_JSON_STORE !== "true") {
      throw new Error("DATABASE_URL (or POSTGRES_URL from the Supabase integration) is required in production");
    }
    console.warn("[binwala] no database URL — using .data/dev-store.json");
    _store = new JsonStore();
  }
  return _store;
}

export const usingPostgres = () => Boolean(dbUrl());
