import { NextResponse } from 'next/server';
import { z } from 'zod';
import { LESSON_STATUSES } from './status';

export const JsonObjectSchema = z.record(z.unknown());

export const CreateRoadmapSchema = z.object({
  title: z.string().trim().min(1, 'Name is required.'),
  description: z.string().nullable().optional(),
});

export const UpdateRoadmapSchema = z.object({
  title: z.string().trim().min(1, 'Title cannot be empty').optional(),
  description: z.string().optional(),
  isLocked: z.boolean().optional(),
});

export const RenameSectionSchema = z.object({
  from: z.string().trim().min(1, 'from is required'),
  to: z.string().trim().min(1, 'to is required'),
});

export const CreateLessonSchema = z.object({
  roadmapSlug: z.string().trim().min(1, 'roadmapSlug and title are required'),
  title: z.string().trim().min(1, 'roadmapSlug and title are required'),
  section: z.string().nullable().optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  status: z.enum(LESSON_STATUSES).optional(),
});

export const UpdateLessonSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  section: z.string().nullable().optional(),
  status: z.enum(LESSON_STATUSES).optional(),
  slug: z.string().optional(),
  roadmapSlug: z.string().optional(),
  markReviewed: z.boolean().optional(),
});

export const UpdateLessonContentSchema = z.object({
  content: z.string().nullable().optional(),
});

export const ReorderLessonsSchema = z.object({
  orderedItemIds: z.array(z.string().trim().min(1)),
});

export async function parseJsonBody<T>(
  req: Request,
  schema: z.ZodType<T>,
  invalidJsonMessage = 'Invalid JSON body',
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: NextResponse.json({ error: invalidJsonMessage }, { status: 400 }) };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Validation failed', issues: parsed.error.issues },
        { status: 400 },
      ),
    };
  }

  return { ok: true, data: parsed.data };
}
