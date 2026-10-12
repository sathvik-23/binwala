-- Binwala waitlist schema (idempotent)
CREATE TABLE IF NOT EXISTS signups (
  id              BIGSERIAL PRIMARY KEY,
  email           TEXT        NOT NULL,
  email_norm      TEXT        NOT NULL UNIQUE,
  neighbourhood   TEXT        NOT NULL,
  neighbourhood_other TEXT,
  resident_type   TEXT,
  community       TEXT,
  household_size  SMALLINT,
  pain_points     TEXT[],
  referral_code   TEXT        NOT NULL UNIQUE,
  referred_by     TEXT,
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  ip_hash         TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signups_neighbourhood_idx ON signups (neighbourhood);
CREATE INDEX IF NOT EXISTS signups_referred_by_idx   ON signups (referred_by);
CREATE INDEX IF NOT EXISTS signups_created_at_idx    ON signups (created_at DESC);

CREATE TABLE IF NOT EXISTS events (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT        NOT NULL,
  props       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  path        TEXT,
  session_id  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_name_created_idx ON events (name, created_at DESC);

-- Supabase exposes the public schema over its REST API. RLS with no policies
-- blocks the anon/authenticated keys; the server connects as the owner role.
ALTER TABLE signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
