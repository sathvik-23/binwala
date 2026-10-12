import "server-only";
import { Pool } from "pg";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export type SignupInput = {
  email: string;
  neighbourhood: string;
  neighbourhoodOther?: string | null;
  referredBy?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
};

export type ProfileInput = {
  residentType?: string | null;
  community?: string | null;
  householdSize?: number | null;
  painPoints?: string[] | null;
};

export type SignupResult = {
  referralCode: string;
  position: number;
  neighbourhood: string;
  neighbourhoodCount: number;
  referrals: number;
  alreadyJoined: boolean;
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
  byResidentType: { id: string; count: number }[];
  byPainPoint: { id: string; count: number }[];
  topCommunities: { neighbourhood: string; community: string; count: number }[];
  topReferrers: { code: string; neighbourhood: string; referrals: number }[];
  bySource: { source: string; count: number }[];
  daily: { day: string; count: number }[];
  funnel: { name: string; count: number }[];
};

export type Row = {
  id: number;
  email: string;
  email_norm: string;
  neighbourhood: string;
  neighbourhood_other: string | null;
  resident_type: string | null;
  community: string | null;
  household_size: number | null;
  pain_points: string[] | null;
  referral_code: string;
  referred_by: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  created_at: string;
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
  updateProfile(code: string, email: string, p: ProfileInput): Promise<boolean>;
  stats(): Promise<Stats>;
  track(name: string, props: Record<string, unknown>, pathName: string | null, sessionId: string | null): Promise<void>;
  admin(): Promise<AdminData>;
  exportRows(): Promise<Row[]>;
}

/* ------------------------------------------------------------------ */
/* Postgres                                                            */
/* ------------------------------------------------------------------ */

const g = globalThis as unknown as { __binwalaPool?: Pool; __binwalaSchema?: Promise<void> };

// Keep in sync with db/schema.sql
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
CREATE INDEX IF NOT EXISTS signups_neighbourhood_idx ON signups (neighbourhood);
CREATE INDEX IF NOT EXISTS signups_referred_by_idx ON signups (referred_by);
CREATE INDEX IF NOT EXISTS signups_created_at_idx ON signups (created_at DESC);
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  props JSONB NOT NULL DEFAULT '{}'::jsonb,
  path TEXT,
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_name_created_idx ON events (name, created_at DESC);
-- Supabase exposes the public schema over its REST API. RLS with no policies
-- blocks the anon/authenticated keys; the server connects as the owner role.
ALTER TABLE signups ENABLE ROW LEVEL SECURITY;
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

/** Creates tables on first use, so a fresh Supabase project works without a manual migration. */
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
    const existing = await q(
      `SELECT id, referral_code, neighbourhood FROM signups WHERE email_norm = $1`,
      [norm],
    );
    if (existing.rows[0]) {
      const r = existing.rows[0];
      const s = await this.summary(r.referral_code, r.neighbourhood, Number(r.id));
      return {
        referralCode: r.referral_code,
        position: s.position,
        neighbourhood: r.neighbourhood,
        neighbourhoodCount: s.ncount,
        referrals: s.referrals,
        alreadyJoined: true,
      };
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
          `INSERT INTO signups (email, email_norm, neighbourhood, neighbourhood_other, referral_code, referred_by,
                                utm_source, utm_medium, utm_campaign, ip_hash, user_agent)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (email_norm) DO NOTHING
           RETURNING id`,
          [
            input.email.trim(),
            norm,
            input.neighbourhood,
            input.neighbourhoodOther ?? null,
            code,
            referredBy,
            input.utmSource ?? null,
            input.utmMedium ?? null,
            input.utmCampaign ?? null,
            input.ipHash ?? null,
            input.userAgent?.slice(0, 300) ?? null,
          ],
        );
        if (!rows[0]) return this.signup(input); // raced with a duplicate email
        const s = await this.summary(code, input.neighbourhood, Number(rows[0].id));
        return {
          referralCode: code,
          position: s.position,
          neighbourhood: input.neighbourhood,
          neighbourhoodCount: s.ncount,
          referrals: 0,
          alreadyJoined: false,
        };
      } catch (e: unknown) {
        const err = e as { code?: string; constraint?: string };
        if (err.code === "23505" && err.constraint?.includes("referral_code")) continue;
        throw e;
      }
    }
    throw new Error("could not allocate referral code");
  }

  async updateProfile(code: string, email: string, p: ProfileInput) {
    const r = await q(
      `UPDATE signups SET
         resident_type  = COALESCE($3, resident_type),
         community      = COALESCE($4, community),
         household_size = COALESCE($5, household_size),
         pain_points    = COALESCE($6, pain_points),
         updated_at     = now()
       WHERE referral_code = $1 AND email_norm = $2`,
      [code, email.trim().toLowerCase(), p.residentType ?? null, p.community ?? null, p.householdSize ?? null, p.painPoints ?? null],
    );
    return (r.rowCount ?? 0) > 0;
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
    await q(`INSERT INTO events (name, props, path, session_id) VALUES ($1,$2,$3,$4)`, [
      name,
      JSON.stringify(props),
      pathName,
      sessionId,
    ]);
  }

  async admin(): Promise<AdminData> {
    const rows = (sql: string) => q(sql).then((r) => r.rows);
    const [totals, byN, byR, byP, comm, refs, src, daily, funnel] = await Promise.all([
      rows(`SELECT count(*)::int AS total,
                count(*) FILTER (WHERE created_at > now() - interval '1 day')::int AS today,
                count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS week
         FROM signups`),
      rows(`SELECT neighbourhood AS id, count(*)::int AS count, count(referred_by)::int AS referred
         FROM signups GROUP BY 1 ORDER BY 2 DESC`),
      rows(`SELECT COALESCE(resident_type,'unknown') AS id, count(*)::int AS count FROM signups GROUP BY 1 ORDER BY 2 DESC`),
      rows(`SELECT p AS id, count(*)::int AS count FROM signups, unnest(pain_points) p GROUP BY 1 ORDER BY 2 DESC`),
      rows(`SELECT neighbourhood, community, count(*)::int AS count FROM signups
         WHERE community IS NOT NULL AND community <> ''
         GROUP BY 1, lower(community), community ORDER BY 3 DESC LIMIT 25`),
      rows(`SELECT s.referral_code AS code, s.neighbourhood, count(r.id)::int AS referrals
         FROM signups s JOIN signups r ON r.referred_by = s.referral_code
         GROUP BY 1,2 ORDER BY 3 DESC LIMIT 15`),
      rows(`SELECT COALESCE(utm_source, CASE WHEN referred_by IS NOT NULL THEN 'referral' ELSE 'direct' END) AS source,
                count(*)::int AS count FROM signups GROUP BY 1 ORDER BY 2 DESC`),
      rows(`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, count(*)::int AS count
         FROM signups WHERE created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 1`),
      rows(`SELECT name, count(DISTINCT COALESCE(session_id, id::text))::int AS count FROM events
         WHERE created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 2 DESC`),
    ]);
    return {
      total: totals[0].total,
      today: totals[0].today,
      week: totals[0].week,
      byNeighbourhood: byN,
      byResidentType: byR,
      byPainPoint: byP,
      topCommunities: comm,
      topReferrers: refs,
      bySource: src,
      daily,
      funnel,
    };
  }

  async exportRows(): Promise<Row[]> {
    const { rows } = await q(
      `SELECT id, email, email_norm, neighbourhood, neighbourhood_other, resident_type, community, household_size,
              pain_points, referral_code, referred_by, utm_source, utm_medium, utm_campaign, created_at
       FROM signups ORDER BY id`,
    );
    return rows;
  }
}

/* ------------------------------------------------------------------ */
/* Dev fallback: JSON file. Only used when DATABASE_URL is missing.    */
/* ------------------------------------------------------------------ */

type DevDb = { signups: Row[]; events: { name: string; props: unknown; path: string | null; session_id: string | null; created_at: string }[] };
const DEV_FILE = path.join(process.cwd(), ".data", "dev-store.json");

class JsonStore implements Store {
  private async load(): Promise<DevDb> {
    try {
      return JSON.parse(await fs.readFile(DEV_FILE, "utf8"));
    } catch {
      return { signups: [], events: [] };
    }
  }
  private async save(db: DevDb) {
    await fs.mkdir(path.dirname(DEV_FILE), { recursive: true });
    await fs.writeFile(DEV_FILE, JSON.stringify(db, null, 2));
  }
  private summary(db: DevDb, r: Row, alreadyJoined: boolean): SignupResult {
    return {
      referralCode: r.referral_code,
      position: db.signups.filter((s) => s.id <= r.id).length,
      neighbourhood: r.neighbourhood,
      neighbourhoodCount: db.signups.filter((s) => s.neighbourhood === r.neighbourhood).length,
      referrals: db.signups.filter((s) => s.referred_by === r.referral_code).length,
      alreadyJoined,
    };
  }
  async signup(input: SignupInput) {
    const db = await this.load();
    const norm = input.email.trim().toLowerCase();
    const found = db.signups.find((s) => s.email_norm === norm);
    if (found) return this.summary(db, found, true);
    let code = makeCode();
    while (db.signups.some((s) => s.referral_code === code)) code = makeCode();
    const row: Row = {
      id: (db.signups.at(-1)?.id ?? 0) + 1,
      email: input.email.trim(),
      email_norm: norm,
      neighbourhood: input.neighbourhood,
      neighbourhood_other: input.neighbourhoodOther ?? null,
      resident_type: null,
      community: null,
      household_size: null,
      pain_points: null,
      referral_code: code,
      referred_by: db.signups.some((s) => s.referral_code === input.referredBy) ? input.referredBy! : null,
      utm_source: input.utmSource ?? null,
      utm_medium: input.utmMedium ?? null,
      utm_campaign: input.utmCampaign ?? null,
      created_at: new Date().toISOString(),
    };
    db.signups.push(row);
    await this.save(db);
    return this.summary(db, row, false);
  }
  async updateProfile(code: string, email: string, p: ProfileInput) {
    const db = await this.load();
    const r = db.signups.find((s) => s.referral_code === code && s.email_norm === email.trim().toLowerCase());
    if (!r) return false;
    if (p.residentType) r.resident_type = p.residentType;
    if (p.community) r.community = p.community;
    if (p.householdSize) r.household_size = p.householdSize;
    if (p.painPoints) r.pain_points = p.painPoints;
    await this.save(db);
    return true;
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
    return {
      total: S.length,
      today: S.filter((s) => now - +new Date(s.created_at) < 864e5).length,
      week: S.filter((s) => now - +new Date(s.created_at) < 7 * 864e5).length,
      byNeighbourhood: tally(S, (s) => s.neighbourhood).map((x) => ({
        ...x,
        referred: S.filter((s) => s.neighbourhood === x.id && s.referred_by).length,
      })),
      byResidentType: tally(S, (s) => s.resident_type ?? "unknown"),
      byPainPoint: tally(S.flatMap((s) => s.pain_points ?? []), (p) => p),
      topCommunities: tally(S.filter((s) => s.community), (s) => `${s.neighbourhood}::${s.community}`).map((x) => {
        const [neighbourhood, community] = x.id.split("::");
        return { neighbourhood, community, count: x.count };
      }),
      topReferrers: tally(S, (s) => s.referred_by).map((x) => ({
        code: x.id,
        neighbourhood: S.find((s) => s.referral_code === x.id)?.neighbourhood ?? "",
        referrals: x.count,
      })),
      bySource: tally(S, (s) => s.utm_source ?? (s.referred_by ? "referral" : "direct")).map((x) => ({ source: x.id, count: x.count })),
      daily: tally(S, (s) => s.created_at.slice(0, 10)).map((x) => ({ day: x.id, count: x.count })).sort((a, b) => a.day.localeCompare(b.day)),
      funnel: tally(db.events, (e) => e.name).map((x) => ({ name: x.id, count: x.count })),
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
    console.warn("[binwala] DATABASE_URL not set — using .data/dev-store.json");
    _store = new JsonStore();
  }
  return _store;
}

export const usingPostgres = () => Boolean(dbUrl());
