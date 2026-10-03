import { SiteHeader } from './components/SiteHeader';
import { SiteFooter } from './components/SiteFooter';
import { Hero } from './components/home/Hero';
import { RunningSection } from './components/home/RunningSection';
import { GolfSection } from './components/home/GolfSection';
import { HowItWorks } from './components/home/HowItWorks';
import { PlansPreview } from './components/home/PlansPreview';
import { SafetySection } from './components/home/SafetySection';
import { Faq } from './components/home/Faq';
import { FinalCTA } from './components/home/FinalCTA';

export default function App() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-full focus:bg-lime focus:px-5 focus:py-3 focus:font-semibold focus:text-ink"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="outline-none">
        <Hero />
        <RunningSection />
        <GolfSection />
        <HowItWorks />
        <PlansPreview />
        <SafetySection />
        <Faq />
        <FinalCTA />
      </main>
      <SiteFooter />
    </>
  );
}
