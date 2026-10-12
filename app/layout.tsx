import type { Metadata, Viewport } from "next";
// Self-hosted fonts (no runtime call to Google): Space Grotesk / Inter / Geist Mono
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/inter";
import "@fontsource-variable/geist-mono";
import "./globals.css";

const site =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: "Binwala: The future of waste collection. Launching in HSR Layout.",
  description:
    "Scheduled pickups, segregation made simple, and proof of where your waste goes. Launching first in HSR Layout. Join the waitlist.",
  openGraph: {
    title: "Binwala: Your waste. Our problem.",
    description: "The future of waste collection, launching first in HSR Layout. Join the waitlist.",
    type: "website",
    siteName: "Binwala",
  },
  twitter: { card: "summary_large_image", title: "Binwala: Your waste. Our problem.", description: "The future of waste collection. Launching in HSR Layout." },
};

export const viewport: Viewport = { themeColor: "#050605", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
