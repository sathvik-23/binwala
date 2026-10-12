"use client";

function sid() {
  try {
    let s = sessionStorage.getItem("bw_sid");
    if (!s) {
      s = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem("bw_sid", s);
    }
    return s;
  } catch {
    return undefined;
  }
}

export function track(name: string, props: Record<string, string | number | boolean | null> = {}) {
  try {
    const body = JSON.stringify({ name, props, path: location.pathname, sid: sid() });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
    else fetch("/api/track", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } });
  } catch {
    /* analytics must never break the page */
  }
}
