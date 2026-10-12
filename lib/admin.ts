import "server-only";
import { timingSafeEqual } from "node:crypto";

export function isAdmin(token: string | null | undefined) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || !token || expected === "change-me") return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
