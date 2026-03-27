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
import { TrackedSection } from "@/components/tracked-section";

export default function Home() {
  return (
    <>
      <AnimatedBackground />
      <FloatingShapes />
      <Navbar />
      <main className="flex-1">
        <TrackedSection sectionId="hero">
          <HeroSection />
        </TrackedSection>
        <TrackedSection sectionId="skills">
          <SkillsSection />
        </TrackedSection>
        <UnlockGate sectionId="experience">
          <TrackedSection sectionId="experience">
            <ExperienceSection />
          </TrackedSection>
        </UnlockGate>
        <UnlockGate sectionId="projects">
          <TrackedSection sectionId="projects">
            <ProjectsSection />
          </TrackedSection>
        </UnlockGate>
        <TrackedSection sectionId="testimonials">
          <TestimonialsSection />
        </TrackedSection>
        <TrackedSection sectionId="cta">
          <CtaSection />
        </TrackedSection>
        <TrackedSection sectionId="faq">
          <FaqSection />
        </TrackedSection>
      </main>
      <Footer />
    </>
  );
}
