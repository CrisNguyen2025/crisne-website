import { Navbar } from "@/components/navbar";
import { HeroSection } from "@/components/hero-section";
import { SkillsSection } from "@/components/skills-section";
import { AnimatedBackground } from "@/components/animated-background";
import { FloatingShapes } from "@/components/floating-shapes";
import { Footer } from "@/components/footer";

export default function Home() {
  return (
    <>
      <AnimatedBackground />
      <FloatingShapes />
      <Navbar />
      <main className="flex-1">
        <HeroSection />
        <SkillsSection />
      </main>
      <Footer />
    </>
  );
}
