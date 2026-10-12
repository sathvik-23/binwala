// Branded welcome email. Table layout + inline styles so it renders in Gmail, Outlook and Apple Mail.
// No remote images: the logo is drawn with text and a lime square, so nothing is blocked.

import { SLOTS, formatPhone } from "@/lib/hsr";
import { areaLabel, OUTSIDE } from "@/lib/neighbourhoods";

export type WelcomeData = {
  name: string;
  email: string;
  phone: string;
  position: number;
  referralCode: string;
  neighbourhood: string;
  addressTitle: string;
  addressLine: string;
  flat?: string | null;
  dumpsPerDay: number;
  pickupSlot: string;
  siteUrl: string;
  alreadyJoined?: boolean;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const n = (x: number) => new Intl.NumberFormat("en-IN").format(x);

const C = { bg: "#050605", card: "#0d100e", line: "#1f2420", text: "#f2f4f0", muted: "#8a918b", dim: "#5b625c", lime: "#c8ff2e" };
const MONO = "'SFMono-Regular',Menlo,Consolas,'Liberation Mono',monospace";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function welcomeEmail(d: WelcomeData) {
  const first = d.name.trim().split(/\s+/)[0] || "there";
  const inHsr = d.neighbourhood !== OUTSIDE;
  const slot = SLOTS.find((s) => s.id === d.pickupSlot);
  const link = `${d.siteUrl.replace(/\/$/, "")}/?ref=${d.referralCode}&n=${d.neighbourhood}`;
  const share = `I just joined the Binwala waitlist: a smarter way to collect waste, launching first in HSR Layout. If you live in HSR, join so our street gets it sooner: ${link}`;
  const wa = `https://wa.me/?text=${encodeURIComponent(share)}`;
  const address = [d.flat, d.addressTitle, d.addressLine].filter(Boolean).join(", ");

  const subject = inHsr ? `You're #${n(d.position)} on the Binwala waitlist, ${first}` : `You're on the Binwala waitlist, ${first}`;
  const preheader = inHsr
    ? `Binwala is launching in HSR Layout. Here's your waitlist pass and how to get your street picked first.`
    : `We're launching in HSR Layout first. Here's your waitlist pass.`;

  const row = (k: string, v: string) => `
    <tr>
      <td style="padding:12px 0;border-top:1px solid ${C.line};font:500 10px/1.4 ${MONO};letter-spacing:.12em;text-transform:uppercase;color:${C.dim};width:38%;vertical-align:top">${k}</td>
      <td style="padding:12px 0;border-top:1px solid ${C.line};font:400 15px/1.45 ${SANS};color:${C.text};vertical-align:top">${v}</td>
    </tr>`;

  const step = (num: string, title: string, body: string) => `
    <tr>
      <td style="width:44px;vertical-align:top;padding:0 0 18px">
        <div style="width:32px;height:32px;border-radius:16px;border:1px solid ${C.lime};color:${C.lime};font:500 11px/32px ${MONO};text-align:center">${num}</div>
      </td>
      <td style="vertical-align:top;padding:4px 0 18px">
        <div style="font:600 16px/1.3 ${SANS};color:${C.text}">${title}</div>
        <div style="font:400 14px/1.5 ${SANS};color:${C.muted};margin-top:4px">${body}</div>
      </td>
    </tr>`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}">
<tr><td align="center" style="padding:32px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">

  <!-- logo -->
  <tr><td style="padding:0 6px 28px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="width:22px;height:22px;background:${C.lime};border-radius:5px"></td>
      <td style="padding-left:10px;font:700 22px/1 ${SANS};letter-spacing:-.05em;color:${C.text}">binwala</td>
    </tr></table>
  </td></tr>

  <!-- hero -->
  <tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:24px;padding:34px 28px">
    <div style="display:inline-block;border:1px solid rgba(200,255,46,.4);background:rgba(200,255,46,.07);border-radius:99px;padding:6px 12px;font:500 10px/1 ${MONO};letter-spacing:.14em;color:${C.lime}">&#9679;&nbsp; ${d.alreadyJoined ? "WELCOME BACK" : inHsr ? "LAUNCHING IN HSR LAYOUT" : "YOU'RE ON THE LIST"}</div>
    <h1 style="margin:22px 0 6px;font:700 38px/1.02 ${SANS};letter-spacing:-.045em;color:${C.text}">You're in,<br><span style="color:${C.lime}">${esc(first)}.</span></h1>
    <p style="margin:14px 0 0;font:400 16px/1.55 ${SANS};color:${C.muted}">
      ${inHsr
        ? `Binwala is starting in HSR Layout: scheduled pickups, segregation made simple, and proof of where your waste goes. You're one of the first on the list.`
        : `We're starting with HSR Layout. You'll hear from us the moment Binwala comes your way.`}
    </p>

    <!-- position -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:26px;border-radius:18px;background:linear-gradient(135deg,rgba(200,255,46,.16),rgba(200,255,46,0) 60%);border:1px solid rgba(200,255,46,.35)">
      <tr><td style="padding:22px 22px 20px">
        <div style="font:500 10px/1 ${MONO};letter-spacing:.14em;color:${C.muted}">WAITLIST PASS · ${esc(d.referralCode)}</div>
        <div style="margin-top:10px;font:700 56px/1 ${SANS};letter-spacing:-.06em;color:${C.lime}">#${n(d.position)}</div>
        <div style="margin-top:6px;font:400 14px/1.4 ${SANS};color:${C.text}">${esc(areaLabel(d.neighbourhood))}</div>
      </td></tr>
    </table>

    <!-- details -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px">
      ${row("Pickup address", esc(address))}
      ${row("Preferred time", slot ? `${esc(slot.label)} <span style="color:${C.muted}">· ${esc(slot.time)}</span>` : "&mdash;")}
      ${row("Bin runs a day", `${d.dumpsPerDay >= 4 ? "4 or more" : d.dumpsPerDay} <span style="color:${C.muted}">time${d.dumpsPerDay > 1 ? "s" : ""} a day</span>`)}
      ${row("Phone", esc(formatPhone(d.phone)))}
    </table>
    <p style="margin:14px 0 0;font:400 12px/1.5 ${SANS};color:${C.dim}">Something wrong? Just reply to this email and we'll fix it.</p>
  </td></tr>

  <!-- next -->
  <tr><td style="padding:34px 8px 6px">
    <div style="font:500 10px/1 ${MONO};letter-spacing:.14em;color:${C.muted};margin-bottom:20px">WHAT HAPPENS NEXT</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${step("01", "We map demand, street by street", "Every signup tells us which buildings and sectors in HSR want pickups first.")}
      ${step("02", "The busiest sectors go first", "Routes open where the most neighbours have joined. Nothing to pay and no commitment now.")}
      ${step("03", "You hear from us before day one", "We'll email you before pickups begin on your street, with timings and pricing.")}
    </table>
  </td></tr>

  <!-- share -->
  <tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:24px;padding:28px">
    <div style="font:700 24px/1.15 ${SANS};letter-spacing:-.035em;color:${C.text}">Get your building picked first.</div>
    <p style="margin:10px 0 22px;font:400 15px/1.55 ${SANS};color:${C.muted}">Drop your link in your apartment or street WhatsApp group. Every neighbour who joins moves your sector up the list.</p>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="border-radius:99px;background:${C.lime}">
        <a href="${wa}" style="display:inline-block;padding:15px 26px;font:600 15px/1 ${SANS};color:#050605;text-decoration:none;border-radius:99px">Share on WhatsApp &rarr;</a>
      </td>
    </tr></table>
    <p style="margin:18px 0 0;font:400 12px/1.5 ${MONO};color:${C.muted};word-break:break-all">Your invite link: <a href="${link}" style="color:${C.lime};text-decoration:none">${esc(link.replace(/^https?:\/\//, ""))}</a></p>
  </td></tr>

  <!-- footer -->
  <tr><td style="padding:28px 8px 0;font:400 12px/1.6 ${SANS};color:${C.dim}">
    You're getting this because ${esc(d.email)} joined the Binwala waitlist at <a href="${esc(d.siteUrl)}" style="color:${C.muted}">${esc(d.siteUrl.replace(/^https?:\/\//, ""))}</a>.
    We only use your details to plan pickups in your area and never sell them. Reply &ldquo;unsubscribe&rdquo; to leave the list.<br><br>
    <span style="font:500 10px/1 ${MONO};letter-spacing:.14em;color:${C.dim}">BINWALA · HSR LAYOUT · BENGALURU</span>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;

  const text = [
    `You're in, ${first}.`,
    "",
    inHsr ? `You're #${n(d.position)} on the Binwala waitlist. Binwala is launching first in HSR Layout.` : `You're on the Binwala waitlist. We're launching in HSR Layout first.`,
    "",
    `Pass code: ${d.referralCode}`,
    `Pickup address: ${address}`,
    `Preferred time: ${slot ? `${slot.label} (${slot.time})` : "-"}`,
    `Bin runs a day: ${d.dumpsPerDay >= 4 ? "4 or more" : d.dumpsPerDay}`,
    `Phone: ${formatPhone(d.phone)}`,
    "",
    "What happens next",
    "1. We map demand street by street.",
    "2. The busiest sectors get routes first. Nothing to pay now.",
    "3. We'll email you before pickups begin on your street.",
    "",
    `Get your building picked first. Share your link: ${link}`,
    "",
    `Reply "unsubscribe" to leave the list.`,
  ].join("\n");

  return { subject, html, text };
}

/** Short internal alert to the team inbox (MAIL_NOTIFY_TO). */
export function teamAlert(d: WelcomeData) {
  const slot = SLOTS.find((s) => s.id === d.pickupSlot);
  const lines = [
    `#${d.position} · ${d.name} · ${areaLabel(d.neighbourhood)}`,
    `${d.email} · ${formatPhone(d.phone)}`,
    `${[d.flat, d.addressTitle, d.addressLine].filter(Boolean).join(", ")}`,
    `${slot ? slot.label : "-"} · ${d.dumpsPerDay}x/day · ref ${d.referralCode}`,
  ];
  return {
    subject: `New waitlist signup #${d.position}: ${d.name} (${areaLabel(d.neighbourhood)})`,
    text: lines.join("\n"),
    html: `<pre style="font:14px/1.6 ${MONO}">${lines.map(esc).join("\n")}</pre>`,
  };
}
