import { describe, expect, it } from 'vitest';
import { withHeadingIds } from '@/lib/roadmap/content-utils';

const ids = (html: string) => withHeadingIds(html).headings.map((h) => h.id);

describe('withHeadingIds', () => {
  it('slugs Vietnamese heading text without diacritics', () => {
    expect(ids('<h2>Tổng quan &amp; Bài toán</h2><h3>Đường đi của dữ liệu</h3>')).toEqual([
      'tong-quan-bai-toan',
      'duong-di-cua-du-lieu',
    ]);
  });

  it('writes the id onto the heading and replaces an existing id', () => {
    const { html } = withHeadingIds('<h2 class="x" id="old">Lost in the Middle</h2>');
    expect(html).toBe('<h2 class="x" id="lost-in-the-middle">Lost in the Middle</h2>');
  });

  it('adds -2, -3 to repeated slugs', () => {
    expect(ids('<h2>Ví dụ</h2><h3>Ví dụ</h3><h2>ví   DỤ!</h2>')).toEqual(['vi-du', 'vi-du-2', 'vi-du-3']);
  });

  it('falls back to "section" when the text has no letters or digits', () => {
    expect(ids('<h2>🚀</h2><h2>***</h2>')).toEqual(['section', 'section-2']);
  });

  it('skips empty headings and ignores h1/h4', () => {
    expect(ids('<h1>Title</h1><h2> </h2><h4>Deep</h4><h3>Kept</h3>')).toEqual(['kept']);
  });

  it('keeps existing ids when a heading is inserted above', () => {
    const before = ids('<h2>Cơ chế</h2><h2>Lưu ý</h2>');
    const after = ids('<h2>Mở đầu</h2><h2>Cơ chế</h2><h2>Lưu ý</h2>');
    expect(after.slice(1)).toEqual(before);
  });
});
