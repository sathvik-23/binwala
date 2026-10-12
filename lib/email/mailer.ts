import "server-only";

/*
  Sends from binwala@perfstaq.com (MAIL_FROM).

  Two ways to deliver, whichever is configured:
    1. RESEND_API_KEY            → Resend HTTP API (verify perfstaq.com in Resend first)
    2. SMTP_HOST/SMTP_USER/SMTP_PASS → the perfstaq.com mailbox directly (Google Workspace, Zoho, Hostinger…)
  With neither set, mail is skipped and logged; signups still succeed.
*/

export type Mail = { to: string; subject: string; html: string; text: string; replyTo?: string };

export const MAIL_FROM = process.env.MAIL_FROM || "Binwala <binwala@perfstaq.com>";
const FROM_ADDRESS = MAIL_FROM.match(/<([^>]+)>/)?.[1] ?? MAIL_FROM;

export function mailConfigured() {
  return Boolean(process.env.RESEND_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS));
}

export async function sendMail(m: Mail): Promise<"sent" | "skipped"> {
  const headers = {
    "List-Unsubscribe": `<mailto:${FROM_ADDRESS}?subject=unsubscribe>`,
    "X-Entity-Ref-ID": `${Date.now()}`,
  };

  if (process.env.RESEND_API_KEY) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: MAIL_FROM, to: [m.to], subject: m.subject, html: m.html, text: m.text, reply_to: m.replyTo ?? FROM_ADDRESS, headers }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return "sent";
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    const nodemailer = (await import("nodemailer")).default;
    const port = Number(process.env.SMTP_PORT || 465);
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 8000,
    });
    await transport.sendMail({ from: MAIL_FROM, to: m.to, subject: m.subject, html: m.html, text: m.text, replyTo: m.replyTo ?? FROM_ADDRESS, headers });
    return "sent";
  }

  console.warn(`[mail] not configured, skipped "${m.subject}" → ${m.to}`);
  return "skipped";
}
