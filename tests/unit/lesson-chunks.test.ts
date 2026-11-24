import { describe, expect, it } from 'vitest';
import { CHUNK_MAX_CHARS, contentToHtml, lessonChunks, withHeadingIds } from '@/lib/roadmap/content-utils';

describe('lessonChunks', () => {
  it('uses the same heading anchors as the lesson page', () => {
    const content =
      '<p>Mở đầu bài.</p><h2>Tổng quan</h2><p>A</p><h3>Đánh giá RAG</h3><p>B</p><h2>Tổng quan</h2><p>C</p>';
    const { headings } = withHeadingIds(contentToHtml(content));
    const chunks = lessonChunks(content);

    expect(chunks.map((c) => c.anchor)).toEqual([null, ...headings.map((h) => h.id)]);
    expect(chunks.map((c) => c.anchor)).toEqual([null, 'tong-quan', 'danh-gia-rag', 'tong-quan-2']);
    expect(chunks.map((c) => c.heading)).toEqual([null, 'Tổng quan', 'Đánh giá RAG', 'Tổng quan']);
    expect(chunks.map((c) => c.text)).toEqual(['Mở đầu bài.', 'A', 'B', 'C']);
  });

  it('starts at the first heading when there is no intro, and skips sections without text', () => {
    const chunks = lessonChunks('<h2>Chỉ tiêu đề</h2><h2>Có nội dung</h2><p>Nội dung.</p>');
    expect(chunks).toEqual([{ anchor: 'co-noi-dung', heading: 'Có nội dung', text: 'Nội dung.' }]);
  });

  it('cuts a long section at paragraph boundaries and keeps its anchor', () => {
    const paragraph = 'Câu mẫu về vector search. '.repeat(20).trim(); // ~520 chars
    const content = `<h2>Dài</h2>${`<p>${paragraph}</p>`.repeat(4)}`;
    const chunks = lessonChunks(content);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.anchor).toBe('dai');
      expect(chunk.text.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
    }
    expect(chunks.map((c) => c.text).join(' ')).toBe(Array(4).fill(paragraph).join(' '));
  });

  it('cuts a single paragraph longer than the limit at sentence ends, then hard', () => {
    const sentences = 'Một câu ngắn. '.repeat(120).trim();
    const unbroken = 'x'.repeat(CHUNK_MAX_CHARS * 2 + 10);
    for (const content of [`<p>${sentences}</p>`, `<p>${unbroken}</p>`]) {
      const chunks = lessonChunks(content);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) expect(chunk.text.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
    }
  });

  it('drops provenance markers and markup, keeping the sentence text', () => {
    const content =
      '<h2>Nguồn</h2><p>Next.js 16 bỏ middleware cũ.<span data-provenance-ref="0b8c"></span> <strong>Đậm</strong></p>';
    expect(lessonChunks(content)).toEqual([
      { anchor: 'nguon', heading: 'Nguồn', text: 'Next.js 16 bỏ middleware cũ. Đậm' },
    ]);
  });

  it('reads plain-text lessons and empty content', () => {
    expect(lessonChunks('Dòng một\n\nDòng hai')).toEqual([
      { anchor: null, heading: null, text: 'Dòng một Dòng hai' },
    ]);
    expect(lessonChunks('')).toEqual([]);
    expect(lessonChunks(null)).toEqual([]);
  });
});
