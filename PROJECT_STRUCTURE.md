# Project Structure

## Overview

Next.js 16.2.1 + React 19.2.4 portfolio website with performance optimizations and accessibility features.

## Directory Structure

```
├── app/                          # Next.js App Router
│   ├── layout.tsx               # Root layout with fonts, metadata, analytics
│   ├── page.tsx                 # Home page with dynamic imports
│   ├── sitemap.ts               # SEO sitemap generation
│   ├── robots.ts                # SEO robots.txt
│   ├── manifest.ts              # PWA manifest
│   ├── icon.png                 # Favicon
│   └── styles/                  # Global styles
│       ├── globals.css          # Tailwind + theme variables
│       ├── spacing.css          # Spacing utilities
│       └── typography.css       # Typography utilities
│
├── components/                   # React components
│   ├── ui/                      # Reusable UI components (shadcn/ui)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── skeleton.tsx         # Loading skeletons
│   │   ├── tooltip.tsx
│   │   └── ...
│   │
│   ├── analytics/               # Analytics components
│   │   ├── gtm.tsx             # Google Tag Manager
│   │   ├── scroll-tracker.tsx   # Scroll tracking
│   │   └── page-timer.tsx       # Page timing
│   │
│   ├── unlock-gate/             # Unlock gate feature
│   │   ├── UnlockGate.tsx
│   │   ├── UnlockModal.tsx
│   │   └── MemoryGame.tsx
│   │
│   ├── error-boundary.tsx       # Error boundary component
│   ├── skip-link.tsx           # Accessibility skip link
│   ├── web-vitals.tsx          # Core Web Vitals monitoring
│   ├── navbar.tsx
│   ├── hero-section.tsx
│   ├── skills-section.tsx
│   ├── experience-section.tsx
│   ├── projects-section.tsx
│   ├── testimonials-section.tsx
│   ├── faq-section.tsx
│   ├── cta-section.tsx
│   ├── footer.tsx
│   ├── animated-background.tsx
│   ├── floating-shapes.tsx
│   ├── json-ld.tsx             # Structured data
│   └── theme-provider.tsx
│
├── hooks/                        # Custom React hooks
│   ├── use-reduced-motion.ts    # Detect prefers-reduced-motion
│   ├── use-scroll-spy.ts
│   ├── use-track-section.ts
│   └── use-unlock.ts
│
├── lib/                          # Utility functions
│   ├── utils.ts                # cn() and helpers
│   ├── analytics.ts            # Analytics utilities
│   └── gtag.ts                 # Google Analytics
│
├── public/                       # Static assets
│   ├── cris-nguyen-cv.pdf
│   ├── og-image.png
│   ├── icon.png
│   └── ...
│
├── next.config.ts               # Next.js config with optimizations
├── package.json
├── tsconfig.json
└── eslint.config.mjs            # ESLint configuration
```

## Key Architecture Decisions

### 1. Dynamic Imports (Performance)

Heavy components below the fold use `next/dynamic`:

```typescript
// app/page.tsx
const ExperienceSection = dynamic(
  () => import("@/components/experience-section").then((mod) => mod.ExperienceSection),
  { loading: () => <ExperienceSkeleton /> }
);
```

**Components using dynamic import:**

- `ExperienceSection` - Heavy with animations
- `ProjectsSection` - Heavy with modals
- `TestimonialsSection` - Carousel component
- `FaqSection` - Below the fold
- `CtaSection` - Below the fold
- `AnimatedBackground` - Decorative
- `FloatingShapes` - Decorative
- `UnlockGate` - Interactive feature

### 2. Error Boundaries (Resilience)

Each section wrapped in ErrorBoundary to prevent total crashes:

```typescript
<ErrorBoundary>
  <TrackedSection sectionId="hero">
    <HeroSection />
  </TrackedSection>
</ErrorBoundary>
```

### 3. Accessibility (a11y)

- **SkipLink**: Keyboard users can skip navigation
- **aria-hidden**: Decorative elements hidden from screen readers
- **Reduced Motion**: `useReducedMotion` hook detects preference
- **Semantic HTML**: Proper heading hierarchy, landmarks

### 4. Performance Monitoring

- **WebVitals**: Core Web Vitals tracking (LCP, FID, CLS, FCP, TTFB)
- **Bundle Analyzer**: `npm run analyze` for bundle analysis
- **Image Optimization**: WebP/AVIF formats, caching headers

### 5. Analytics

- **Google Analytics 4**: Page views, events
- **Google Tag Manager**: Tag management
- **Scroll Tracking**: Section visibility
- **Page Timing**: Performance metrics

## Component Categories

### UI Components (`components/ui/`)

Reusable, generic components following shadcn/ui patterns:

- Use `cn()` for class merging
- Support `className` prop
- Forward refs where appropriate
- Accessible by default

### Section Components

Page sections with specific purposes:

- Self-contained
- Handle own data
- Wrapped in ErrorBoundary
- Use skeleton loading states

### Feature Components

Complex interactive features:

- `unlock-gate/`: Memory game unlock system
- `analytics/`: Tracking components

## Styling Architecture

### Tailwind CSS v4

- CSS-first configuration in `globals.css`
- Theme variables for colors
- Custom animations
- Responsive utilities

### Color System

```css
/* globals.css */
:root {
  --background: oklch(0.97 0.004 240);
  --foreground: oklch(0.2 0.015 240);
  --primary: oklch(0.62 0.09 240);
  /* ... */
}
```

### Fonts

- **Inter**: Sans-serif body text
- **JetBrains Mono**: Monospace code
- **Fraunces**: Display headings

## Build & Deploy

### Scripts

```bash
npm run dev      # Development server (port 3334)
npm run build    # Production build
npm run lint     # ESLint check
npm run analyze  # Bundle analysis
```

### Optimizations Enabled

- Turbopack for fast builds
- `optimizePackageImports` for framer-motion, lucide-react
- Image optimization (WebP, AVIF)
- Static page generation
- Caching headers

## Environment Variables

Required for full functionality:

- `NEXT_PUBLIC_GA_ID`: Google Analytics ID
- `NEXT_PUBLIC_GTM_ID`: Google Tag Manager ID
- `ANALYZE=true`: Enable bundle analyzer
