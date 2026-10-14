"use client";

import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useTransform,
} from "framer-motion";
import { useRef, useState } from "react";
import { Quote, Star } from "lucide-react";

import { cn } from "@/lib/utils";

interface Testimonial {
  id: string;
  name: string;
  role: string;
  company: string;
  avatar: string;
  content: string;
  rating: number;
  relation: string;
}

const testimonials: Testimonial[] = [
  {
    id: "minh-tran",
    name: "Minh Trần",
    role: "Engineering Lead",
    company: "Smartbit Technology",
    avatar: "MT",
    content:
      "Cris built our core front-office onboarding and back-office RBAC modules in Next.js. He handled Paystack and eKYC integrations cleanly and kept release cycles predictable.",
    rating: 5,
    relation: "Team lead",
  },
  {
    id: "sarah-chen",
    name: "Sarah Chen",
    role: "Product Manager",
    company: "Zelene Spa",
    avatar: "SC",
    content:
      "Cris delivered the spa booking flow and mobile app integration on schedule. His performance optimizations cut our initial page load time in half.",
    rating: 5,
    relation: "Cross-functional collaborator",
  },
  {
    id: "duc-hoang",
    name: "Đức Hoàng",
    role: "Lead Engineer",
    company: "Fintech Systems",
    avatar: "ĐH",
    content:
      "Strong TypeScript fundamentals and disciplined component architecture. His clean API contracts made frontend and backend collaboration straightforward.",
    rating: 5,
    relation: "Senior colleague",
  },
  {
    id: "emma-rodriguez",
    name: "Emma Rodriguez",
    role: "Product Owner",
    company: "Kamala Platform",
    avatar: "ER",
    content:
      "Cris rebuilt our product catalog with Next.js App Router and Strapi. The page speed and SEO improvements were immediately apparent after launch.",
    rating: 5,
    relation: "Client collaborator",
  },
  {
    id: "khoa-nguyen",
    name: "Khoa Nguyễn",
    role: "Backend Engineer",
    company: "CloudBase",
    avatar: "KN",
    content:
      "Understands REST and real-time state management thoroughly. He clarifies edge cases before building, saving considerable debugging time during sprint deliveries.",
    rating: 5,
    relation: "Backend partner",
  },
  {
    id: "linh-pham",
    name: "Linh Phạm",
    role: "UI/UX Designer",
    company: "Pixel Studio",
    avatar: "LP",
    content:
      "Translates complex Figma component variants into responsive code accurately. He regularly catches layout edge cases on smaller screens before QA reviews.",
    rating: 5,
    relation: "Design partner",
  },
];

const avatarGradients = [
  "from-steel to-steel-light",
  "from-steel-dark to-steel",
  "from-blue-500 to-cyan-500",
  "from-emerald-500 to-teal-500",
  "from-rose-500 to-orange-500",
  "from-steel-light to-steel",
];

interface TestimonialCardProps {
  readonly testimonial: Testimonial;
  readonly gradientIndex: number;
}

function TestimonialCard({ testimonial, gradientIndex }: TestimonialCardProps) {
  return (
    <div className="flex flex-col self-stretch shrink-0 w-72 sm:w-80">
      <motion.div
        className="group relative flex-1 flex flex-col p-6 rounded-2xl border border-border/50 bg-background/60 backdrop-blur-md cursor-default shadow-[0_2px_12px_0_rgba(0,0,0,0.06)]"
        whileHover={{ y: -6, borderColor: "rgba(212,168,83,0.4)" }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          className="absolute inset-0 rounded-2xl opacity-0 pointer-events-none bg-[radial-gradient(ellipse_at_30%_20%,rgba(212,168,83,0.07)_0%,transparent_70%)]"
          whileHover={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        />

        <div className="absolute top-4 right-4 text-muted-foreground/12 pointer-events-none">
          <Quote className="w-9 h-9 fill-current" />
        </div>

        <div className="flex items-center gap-1 mb-4">
          {Array.from({ length: testimonial.rating }).map((_, i) => (
            <Star
              key={`star-${testimonial.id}-${i}`}
              className="w-3.5 h-3.5 fill-steel-light text-steel-light"
            />
          ))}
        </div>

        <p className="flex-1 text-sm text-muted-foreground leading-relaxed mb-6 pr-2">
          &ldquo;{testimonial.content}&rdquo;
        </p>

        <div className="flex items-start gap-2.5 pt-4 border-t border-border/40">
          <div
            className={cn(
              "w-9 h-9 rounded-full flex items-center justify-center text-[0.65rem] font-bold text-white shrink-0 bg-linear-to-br",
              avatarGradients[gradientIndex % avatarGradients.length],
            )}
          >
            {testimonial.avatar}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold leading-snug">
                {testimonial.name}
              </p>
              <span className="text-[0.6rem] font-medium text-steel/80 bg-steel-light/8 border border-steel-light/15 px-2 py-0.5 rounded-full leading-none whitespace-nowrap">
                {testimonial.relation}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-snug mt-0.5 truncate">
              {testimonial.role}
              <span className="mx-1 opacity-40">&middot;</span>
              {testimonial.company}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

interface InfiniteScrollerProps {
  readonly items: Testimonial[];
  readonly speed?: number;
}

function InfiniteScroller({ items, speed = 35 }: InfiniteScrollerProps) {
  const x = useMotionValue(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const duplicated = [...items, ...items];

  useAnimationFrame((_, delta) => {
    if (paused) return;
    const container = containerRef.current;
    if (!container) return;

    const totalWidth = container.scrollWidth / 2;
    const newX = x.get() - (delta / 1000) * speed;
    x.set(newX <= -totalWidth ? 0 : newX);
  });

  const translateX = useTransform(x, (v) => `${v}px`);

  return (
    <section
      aria-label="Testimonials carousel"
      className="overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <motion.div
        ref={containerRef}
        className="flex items-stretch gap-5 w-max py-4"
        style={{ x: translateX }}
      >
        {duplicated.map((t, i) => (
          <TestimonialCard
            key={`${t.id}-copy-${i < items.length ? "a" : "b"}`}
            testimonial={t}
            gradientIndex={i % items.length}
          />
        ))}
      </motion.div>
    </section>
  );
}

export function TestimonialsSection() {
  return (
    <section
      id="testimonials"
      className="relative section-padding overflow-hidden"
    >
      <div className="section-container sm:px-6 mb-16">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.span
            className="inline-block section-label mb-4"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            What People Say
          </motion.span>
          <h2 className="heading-2 mb-4">
            <span className="heading-display-italic bg-linear-to-r from-steel to-steel-light bg-clip-text text-transparent font-semibold">
              Testimonials
            </span>
          </h2>
          <p className="text-muted-foreground body-lg max-w-2xl mx-auto">
            Real feedback from clients and colleagues I&apos;ve had the pleasure
            of working with.
          </p>
        </motion.div>
      </div>

      <div className="relative">
        <div className="absolute left-0 top-0 bottom-0 w-24 sm:w-40 bg-linear-to-r from-background to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-24 sm:w-40 bg-linear-to-l from-background to-transparent z-10 pointer-events-none" />
        <InfiniteScroller items={testimonials} speed={55} />
      </div>
    </section>
  );
}
