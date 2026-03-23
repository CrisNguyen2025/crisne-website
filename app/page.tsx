import { Navbar } from "@/components/navbar";
import { HeroSection } from "@/components/hero-section";
import { SkillsSection } from "@/components/skills-section";
import { ExperienceSection } from "@/components/experience-section";
import { ProjectsSection } from "@/components/projects-section";
import { TestimonialsSection } from "@/components/testimonials-section";
import { FaqSection } from "@/components/faq-section";
import { CtaSection } from "@/components/cta-section";
import { AnimatedBackground } from "@/components/animated-background";
import { FloatingShapes } from "@/components/floating-shapes";
import { Footer } from "@/components/footer";
import { UnlockGate } from "@/components/unlock-gate";

export default function Home() {
  return (
    <>
      <AnimatedBackground />
      <FloatingShapes />
      <Navbar />
      <main className="flex-1">
        <HeroSection />
        <SkillsSection />
        <UnlockGate sectionId="experience">
          <ExperienceSection />
        </UnlockGate>
        <UnlockGate sectionId="projects">
          <ProjectsSection />
        </UnlockGate>
        <TestimonialsSection />
        <CtaSection />
        <FaqSection />
      </main>
      <Footer />
    </>
  );
}
