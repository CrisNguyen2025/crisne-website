import { ImageResponse } from 'next/og';
import { prisma } from '@/lib/prisma';
import { readingMinutes } from '@/lib/roadmap/content-utils';

export const alt = 'Lesson — Crisne Knowledge Based';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function LessonOpenGraphImage({
  params,
}: {
  params: Promise<{ lessonSlug: string }>;
}) {
  const { lessonSlug } = await params;
  const lesson = await prisma.roadmapItem.findUnique({
    where: { slug: lessonSlug },
    select: {
      title: true,
      description: true,
      section: true,
      content: true,
      roadmap: { select: { title: true } },
    },
  });

  const topicTitle = lesson?.roadmap.title || 'Knowledge Based';
  const sectionLabel = lesson?.section ? ` · ${lesson.section}` : '';
  const title = lesson?.title || 'Lesson';
  const description = lesson?.description || '';
  const mins = readingMinutes(lesson?.content);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#FAFAFA',
          color: '#18181B',
          padding: '64px 72px',
          border: '1px solid #E4E4E7',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '22px', fontWeight: 600, color: '#52525B' }}>
            {topicTitle}
            {sectionLabel}
          </span>
          <span style={{ fontSize: '20px', color: '#71717A' }}>Crisne · Knowledge Based</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ fontSize: '56px', fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.02em' }}>
            {title}
          </div>
          {description ? (
            <div style={{ fontSize: '25px', lineHeight: 1.45, color: '#52525B', maxWidth: '960px' }}>
              {description.slice(0, 140)}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid #E4E4E7',
            paddingTop: '24px',
            fontSize: '22px',
            color: '#71717A',
          }}
        >
          <span style={{ display: 'flex' }}>{mins > 0 ? `${mins} phút đọc` : 'Crisne'}</span>
          <span style={{ display: 'flex' }}>crisne.blog</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
