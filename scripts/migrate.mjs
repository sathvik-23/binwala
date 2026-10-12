// Applies db/schema.sql to DATABASE_URL. Usage: npm run db:migrate
import { readFileSync, existsSync } from "node:fs";
import pg from "pg";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!raw) {
  console.error("DATABASE_URL (or POSTGRES_URL) is not set");
  process.exit(1);
}
const needsSsl = process.env.DATABASE_SSL === "true" || /supabase\.(co|com)|sslmode=/.test(raw);
const u = new URL(raw);
u.searchParams.delete("sslmode");
u.searchParams.delete("supa");
const client = new pg.Client({ connectionString: u.toString(), ssl: needsSsl ? { rejectUnauthorized: false } : undefined });
await client.connect();
await client.query(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
await client.end();
console.log("✓ schema applied");
