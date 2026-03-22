"use client";

import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useTransform,
} from "framer-motion";
import { useRef, useState } from "react";
import { Quote, Star } from "lucide-react";
import { GradientText } from "@/components/gradient-text";
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
    role: "CTO",
    company: "TechViet Solutions",
    avatar: "MT",
    content:
      "Cris delivered an exceptional frontend architecture for our SaaS platform. His attention to detail, deep knowledge of Next.js, and ability to translate complex designs into pixel-perfect UIs made him an invaluable asset to our team.",
    rating: 5,
    relation: "Direct manager",
  },
  {
    id: "sarah-chen",
    name: "Sarah Chen",
    role: "Product Manager",
    company: "Innovate Labs",
    avatar: "SC",
    content:
      "Working with Cris was a fantastic experience. He proactively flagged UX improvements we hadn't considered, and delivered every sprint on time. The performance optimizations he implemented reduced our load time by 60%.",
    rating: 5,
    relation: "Cross-functional collaborator",
  },
  {
    id: "duc-hoang",
    name: "Đức Hoàng",
    role: "Lead Engineer",
    company: "Fintech Corp",
    avatar: "ĐH",
    content:
      "Cris is one of the most meticulous frontend developers I've worked with. His TypeScript skills are top-notch and he always writes clean, maintainable code. He elevated our entire team's coding standards.",
    rating: 5,
    relation: "Senior colleague",
  },
  {
    id: "emma-rodriguez",
    name: "Emma Rodriguez",
    role: "Founder",
    company: "DesignForward",
    avatar: "ER",
    content:
      "I hired Cris to rebuild our company website and the result blew us away. He combined beautiful Framer Motion animations with a lightning-fast architecture. Our conversion rate improved by 35% after the relaunch.",
    rating: 5,
    relation: "Client",
  },
  {
    id: "khoa-nguyen",
    name: "Khoa Nguyễn",
    role: "Backend Engineer",
    company: "CloudBase",
    avatar: "KN",
    content:
      "Cris is the kind of frontend dev every backend engineer dreams of partnering with — he understands APIs deeply, asks the right questions, and never requires repeated explanations. A true full-stack mindset.",
    rating: 5,
    relation: "Team member",
  },
  {
    id: "linh-pham",
    name: "Linh Phạm",
    role: "UX Designer",
    company: "Pixel Studio",
    avatar: "LP",
    content:
      "Rarely do you meet a developer who truly respects design intent. Cris treated every pixel as intentional and even suggested micro-interactions that made the final product feel alive. A designer's dream collaborator.",
    rating: 5,
    relation: "Design partner",
  },
];

const avatarGradients = [
  "from-indigo-500 to-purple-500",
  "from-purple-500 to-pink-500",
  "from-blue-500 to-cyan-500",
  "from-emerald-500 to-teal-500",
  "from-orange-500 to-amber-500",
  "from-rose-500 to-pink-500",
];

interface TestimonialCardProps {
  readonly testimonial: Testimonial;
  readonly gradientIndex: number;
}

function TestimonialCard({ testimonial, gradientIndex }: TestimonialCardProps) {
  return (
    <div className="flex flex-col self-stretch shrink-0 w-72 sm:w-80">
      <motion.div
        className="group relative flex-1 flex flex-col p-6 rounded-2xl border border-border/50 bg-background/60 backdrop-blur-md cursor-default"
        whileHover={{ y: -6, borderColor: "rgba(99,102,241,0.4)" }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        style={{ boxShadow: "0 2px 12px 0 rgba(0,0,0,0.06)" }}
      >
        <motion.div
          className="absolute inset-0 rounded-2xl opacity-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 30% 20%, rgba(99,102,241,0.07) 0%, transparent 70%)",
          }}
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
              className="w-3.5 h-3.5 fill-amber-400 text-amber-400"
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
              <span className="text-[0.6rem] font-medium text-indigo-500/80 bg-indigo-500/8 border border-indigo-500/15 px-2 py-0.5 rounded-full leading-none whitespace-nowrap">
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
      className="relative py-7 sm:py-10 overflow-hidden"
    >
      <div className="max-w-6xl mx-auto px-6 mb-16">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.span
            className="inline-block text-sm font-mono text-muted-foreground tracking-widest uppercase mb-4"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            What People Say
          </motion.span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
            <GradientText>Testimonials</GradientText>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
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
