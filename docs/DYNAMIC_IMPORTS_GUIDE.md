# Dynamic Imports & Color System Guide

## Dynamic Imports in Next.js

### Why Use Dynamic Imports?

1. **Reduce Initial Bundle Size**: Load heavy components only when needed
2. **Improve Time to Interactive (TTI)**: Smaller initial JS payload
3. **Code Splitting**: Automatic chunk splitting by Next.js
4. **Lazy Loading**: Load components below the fold on demand

### Basic Syntax

```typescript
import dynamic from "next/dynamic";

// Basic dynamic import
const Component = dynamic(() => import("@/components/component"));

// With loading state
const Component = dynamic(
  () => import("@/components/component"),
  { loading: () => <Skeleton /> }
);

// Named export
const Component = dynamic(
  () => import("@/components/component").then((mod) => mod.ComponentName),
  { loading: () => <Skeleton /> }
);
```

### Current Implementation

```typescript
// app/page.tsx
import dynamic from "next/dynamic";

// Dynamic imports for heavy components below the fold
const ExperienceSection = dynamic(
  () => import("@/components/experience-section").then((mod) => mod.ExperienceSection),
  { loading: () => <ExperienceSkeleton /> }
);

const ProjectsSection = dynamic(
  () => import("@/components/projects-section").then((mod) => mod.ProjectsSection),
  { loading: () => <ProjectsSkeleton /> }
);
```

### Best Practices

1. **Always provide loading states**: Use skeleton components
2. **Don't use `ssr: false` in Server Components**: Only in Client Components
3. **Import below the fold**: Hero/above-fold should be static
4. **Group related imports**: Keep dynamic imports organized

### Skeleton Loading States

Create matching skeletons for each dynamic component:

```typescript
// components/ui/skeleton.tsx
export function ExperienceSkeleton() {
  return (
    <div className="py-20 px-4 min-h-[400px]">
      <Skeleton className="h-8 w-48 mx-auto mb-12" />
      <div className="max-w-3xl mx-auto space-y-6">
        {/* ... skeleton items */}
      </div>
    </div>
  );
}
```

## Color System

### CSS Variables Approach

Using CSS custom properties for theming:

```css
/* app/styles/globals.css */
:root {
  /* Light theme (default) */
  --background: oklch(0.97 0.004 240);
  --foreground: oklch(0.2 0.015 240);
  --primary: oklch(0.62 0.09 240);
  --primary-foreground: oklch(0.99 0 0);
  /* ... */
}

.dark {
  /* Dark theme */
  --background: oklch(0.15 0.02 240);
  --foreground: oklch(0.95 0.01 240);
  /* ... */
}
```

### OKLCH Color Format

**Why OKLCH?**

- **Perceptually uniform**: Same lightness value = same perceived brightness
- **Wide gamut**: Supports P3 and Rec.2020 colors
- **Predictable**: Changing hue doesn't affect lightness

**Format**: `oklch(L C H / alpha)`

- `L`: Lightness (0-1 or 0%-100%)
- `C`: Chroma (color intensity, 0+ )
- `H`: Hue angle (0-360 or 0-400 grad)
- `alpha`: Opacity (0-1)

### Usage in Components

```typescript
// ❌ Don't use oklch() directly in JS animations
// Framer Motion has issues with oklch interpolation

// ✅ Use rgba() or hex for animations
style={{
  background: "radial-gradient(circle, rgba(107, 154, 196, 0.15), transparent 70%)"
}}

// ✅ Use CSS variables for static colors
className="bg-background text-foreground"
```

### Brand Colors

```css
:root {
  --brand: #6b9ac4;
  --brand-light: #8bb5d9;
  --brand-dark: #4a7a9b;
  --brand-accent: #e8f4f8;

  /* Steel blue palette */
  --color-steel: #6b9ac4;
  --color-steel-light: #8bb5d9;
  --color-steel-dark: #4a7a9b;
}
```

### Tailwind Theme Integration

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-brand: var(--brand);
  /* ... */
}
```

Usage:

```html
<div class="bg-background text-foreground">
  <button class="bg-primary text-primary-foreground">Click me</button>
</div>
```

### Color Contrast & Accessibility

- All color combinations meet WCAG 2.1 AA standards
- Test with: [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- Dark mode automatically adjusts for contrast

### Reduced Motion Support

```typescript
// hooks/use-reduced-motion.ts
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );
}

// Usage in component
const prefersReducedMotion = useReducedMotion();

if (prefersReducedMotion) {
  return <StaticVersion />;
}
return <AnimatedVersion />;
```

## Animation Colors

### Problem: OKLCH in Framer Motion

Framer Motion cannot interpolate OKLCH colors smoothly:

```typescript
// ❌ This causes errors
animate={{
  background: "oklch(0.62 0.09 240 / 0.15)"  // Error!
}}
```

### Solution: Use RGBA or Hex

```typescript
// ✅ Use rgba() for animations
animate={{
  background: "rgba(107, 154, 196, 0.15)"
}}

// Or use CSS variables with transitions
className="transition-colors duration-500"
style={{ background: "var(--brand)" }}
```

### Static vs Animated Colors

| Use Case        | Format   | Example                     |
| --------------- | -------- | --------------------------- |
| Static styles   | CSS vars | `bg-primary`                |
| Framer Motion   | RGBA/Hex | `rgba(107, 154, 196, 0.15)` |
| CSS Transitions | CSS vars | `transition-colors`         |
| Gradients       | RGBA/Hex | `radial-gradient(...)`      |

## Quick Reference

### Adding New Dynamic Component

1. Create component: `components/my-section.tsx`
2. Create skeleton: `components/ui/skeleton.tsx`
3. Add dynamic import in `app/page.tsx`:

```typescript
const MySection = dynamic(
  () => import("@/components/my-section").then((mod) => mod.MySection),
  { loading: () => <MySkeleton /> }
);
```

4. Wrap in ErrorBoundary:

```typescript
<ErrorBoundary>
  <MySection />
</ErrorBoundary>
```

### Adding New Color

1. Add to `globals.css`:

```css
:root {
  --new-color: oklch(0.5 0.1 180);
}

.dark {
  --new-color: oklch(0.6 0.1 180);
}
```

2. Add to `@theme inline`:

```css
@theme inline {
  --color-new-color: var(--new-color);
}
```

3. Use in components:

```html
<div class="bg-new-color">Content</div>
```

4. For animations, add RGBA version:

```typescript
// In component
const NEW_COLOR_RGBA = "rgba(128, 200, 180, 0.5)";
```
