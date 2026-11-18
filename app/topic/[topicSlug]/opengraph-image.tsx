import { ImageResponse } from 'next/og';
import { prisma } from '@/lib/prisma';
import { sectionsInOrder } from '@/lib/roadmap/sections';

export const alt = 'Topic — Crisne Knowledge Based';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function TopicOpenGraphImage({
  params,
}: {
  params: Promise<{ topicSlug: string }>;
}) {
  const { topicSlug } = await params;
  const topic = await prisma.roadmap.findUnique({
    where: { slug: topicSlug },
    select: {
      title: true,
      description: true,
      items: { select: { section: true } },
    },
  });

  const title = topic?.title || 'Topic';
  const description = topic?.description || '';
  const lessonCount = topic?.items.length ?? 0;
  const sectionCount = topic
    ? sectionsInOrder(topic.items).filter((s) => s !== null).length
    : 0;

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
          <span style={{ fontSize: '22px', fontWeight: 600, color: '#18181B' }}>
            Crisne · Knowledge Based
          </span>
          <span style={{ fontSize: '20px', color: '#71717A' }}>crisne.blog</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ fontSize: '60px', fontWeight: 700, lineHeight: 1.12, letterSpacing: '-0.02em' }}>
            {title}
          </div>
          {description ? (
            <div style={{ fontSize: '26px', lineHeight: 1.45, color: '#52525B', maxWidth: '960px' }}>
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
          <span style={{ display: 'flex' }}>{lessonCount} bài học</span>
          <span style={{ display: 'flex' }}>{sectionCount} mục</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
