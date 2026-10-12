-- Binwala waitlist schema (idempotent). The app also applies this automatically on first request.
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
