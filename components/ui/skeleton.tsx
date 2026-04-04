import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

// Section-specific skeletons
export function HeroSkeleton() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center gap-8 p-8">
      <Skeleton className="h-12 w-64" />
      <Skeleton className="h-6 w-96" />
      <div className="flex gap-4">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  );
}

export function SkillsSkeleton() {
  return (
    <div className="py-20 px-4">
      <Skeleton className="h-8 w-48 mx-auto mb-12" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}

export function ExperienceSkeleton() {
  return (
    <div className="py-20 px-4 min-h-[400px]">
      <Skeleton className="h-8 w-48 mx-auto mb-12" />
      <div className="max-w-3xl mx-auto space-y-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-20 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProjectsSkeleton() {
  return (
    <div className="py-20 px-4 min-h-[600px]">
      <Skeleton className="h-8 w-48 mx-auto mb-12" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full" />
        ))}
      </div>
    </div>
  );
}

export function TestimonialsSkeleton() {
  return (
    <div className="py-20 px-4 min-h-[400px]">
      <Skeleton className="h-8 w-48 mx-auto mb-12" />
      <div className="max-w-2xl mx-auto">
        <Skeleton className="h-40 w-full mb-4" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function CtaSkeleton() {
  return (
    <div className="py-20 px-4 min-h-[200px]">
      <div className="max-w-2xl mx-auto text-center space-y-6">
        <Skeleton className="h-8 w-64 mx-auto" />
        <Skeleton className="h-4 w-96 mx-auto" />
        <Skeleton className="h-12 w-40 mx-auto" />
      </div>
    </div>
  );
}

export function FaqSkeleton() {
  return (
    <div className="py-20 px-4 min-h-[300px]">
      <Skeleton className="h-8 w-48 mx-auto mb-12" />
      <div className="max-w-2xl mx-auto space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}
