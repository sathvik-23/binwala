import { ImageResponse } from "next/og";

export const alt = "Binwala: Your waste. Our problem.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  const lime = "#C8FF2E";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: "radial-gradient(circle at 78% 70%, rgba(200,255,46,0.22), rgba(5,6,5,0) 45%), #050605",
          color: "#F2F4F0",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: lime, display: "flex" }} />
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -2 }}>binwala</div>
          <div style={{ marginLeft: 24, fontSize: 20, color: lime, border: `1px solid ${lime}`, padding: "6px 14px", borderRadius: 99, letterSpacing: 2 }}>● LAUNCHING IN HSR LAYOUT</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 128, fontWeight: 800, letterSpacing: -7, lineHeight: 0.92 }}>
          <span>Your waste.</span>
          <span style={{ color: lime }}>Our problem.</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: "#8A918B", letterSpacing: 1 }}>
          <span>The future of waste collection.</span>
          <span style={{ color: "#F2F4F0" }}>Join the waitlist →</span>
        </div>
      </div>
    ),
    size,
  );
}
