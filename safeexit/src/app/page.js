import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import Features from "./components/Features";
import Simulator from "./components/Simulator";
import HowItWorks from "./components/HowItWorks";
import Security from "./components/Security";
import Stats from "./components/Stats";
import Footer from "./components/Footer";

export const metadata = {
  title: "SafeExit | Privacy-First Smart Hostel Access & Safety System",
  description: "SafeExit replaces outdated physical registries with a privacy-first digital system that protects student numbers, automates travel approvals, and logs full audit trails.",
};

export default function Home() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
      {/* Navbar */}
      <Navbar />

      {/* Main Content Sections */}
      <main className="flex-1">
        {/* Hero Section */}
        <Hero />

        {/* Features Section */}
        <Features />

        {/* How It Works Section */}
        <HowItWorks />

        {/* Security Section */}
        <Security />

        {/* Interactive Simulator Section */}
        <Simulator />

        {/* Statistics Section */}
        <Stats />
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
