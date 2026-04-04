import dynamic from "next/dynamic";
import { Navbar } from "@/components/navbar";
import { HeroSection } from "@/components/hero-section";
import { SkillsSection } from "@/components/skills-section";
import { Footer } from "@/components/footer";
import { TrackedSection } from "@/components/tracked-section";
import { ErrorBoundary } from "@/components/error-boundary";
import {
  ExperienceSkeleton,
  ProjectsSkeleton,
  TestimonialsSkeleton,
  FaqSkeleton,
  CtaSkeleton,
} from "@/components/ui/skeleton";

// Dynamic imports for heavy components below the fold with skeleton loading states
const ExperienceSection = dynamic(
  () =>
    import("@/components/experience-section").then(
      (mod) => mod.ExperienceSection,
    ),
  { loading: () => <ExperienceSkeleton /> },
);

const ProjectsSection = dynamic(
  () =>
    import("@/components/projects-section").then((mod) => mod.ProjectsSection),
  { loading: () => <ProjectsSkeleton /> },
);

const TestimonialsSection = dynamic(
  () =>
    import("@/components/testimonials-section").then(
      (mod) => mod.TestimonialsSection,
    ),
  { loading: () => <TestimonialsSkeleton /> },
);

const FaqSection = dynamic(
  () => import("@/components/faq-section").then((mod) => mod.FaqSection),
  { loading: () => <FaqSkeleton /> },
);

const CtaSection = dynamic(
  () => import("@/components/cta-section").then((mod) => mod.CtaSection),
  { loading: () => <CtaSkeleton /> },
);

const AnimatedBackground = dynamic(() =>
  import("@/components/animated-background").then(
    (mod) => mod.AnimatedBackground,
  ),
);

const FloatingShapes = dynamic(() =>
  import("@/components/floating-shapes").then((mod) => mod.FloatingShapes),
);

const UnlockGate = dynamic(() =>
  import("@/components/unlock-gate").then((mod) => mod.UnlockGate),
);

export default function Home() {
  return (
    <>
      <AnimatedBackground />
      <FloatingShapes />
      <Navbar />
      <main id="main-content" className="flex-1" tabIndex={-1}>
        <ErrorBoundary>
          <TrackedSection sectionId="hero">
            <HeroSection />
          </TrackedSection>
        </ErrorBoundary>

        <ErrorBoundary>
          <TrackedSection sectionId="skills">
            <SkillsSection />
          </TrackedSection>
        </ErrorBoundary>

        <UnlockGate sectionId="experience">
          <TrackedSection sectionId="experience">
            <ErrorBoundary>
              <ExperienceSection />
            </ErrorBoundary>
          </TrackedSection>
        </UnlockGate>

        <UnlockGate sectionId="projects">
          <TrackedSection sectionId="projects">
            <ErrorBoundary>
              <ProjectsSection />
            </ErrorBoundary>
          </TrackedSection>
        </UnlockGate>

        <ErrorBoundary>
          <TrackedSection sectionId="testimonials">
            <TestimonialsSection />
          </TrackedSection>
        </ErrorBoundary>

        <ErrorBoundary>
          <TrackedSection sectionId="cta">
            <CtaSection />
          </TrackedSection>
        </ErrorBoundary>

        <ErrorBoundary>
          <TrackedSection sectionId="faq">
            <FaqSection />
          </TrackedSection>
        </ErrorBoundary>
      </main>
      <Footer />
    </>
  );
}
