import { getStats } from "@/lib/statsCache";
import type { Stats } from "@/lib/store";
import { WaitlistProvider } from "@/components/WaitlistContext";
import Experience from "@/components/Experience";
import Loader from "@/components/Loader";
import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import Marquee from "@/components/Marquee";
import Problem from "@/components/Problem";
import HowItWorks from "@/components/HowItWorks";
import Network from "@/components/Network";
import FAQ from "@/components/FAQ";
import FinalCTA from "@/components/FinalCTA";
import Footer from "@/components/Footer";
import Success from "@/components/Success";
import Cursor from "@/components/Cursor";

export const dynamic = "force-dynamic";

export default async function Home() {
  let stats: Stats = { total: 0, neighbourhoods: [], recent: [] };
  try {
    stats = await getStats();
  } catch (e) {
    console.error("[home] stats unavailable", e);
  }
  return (
    <WaitlistProvider initialStats={stats}>
      <Loader />
      <Experience />
      <Nav />
      <main>
        <Hero />
        <Marquee />
        <Problem />
        <HowItWorks />
        <Network />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
      <Success />
      <Cursor />
      <div className="grain" aria-hidden="true" />
    </WaitlistProvider>
  );
}
