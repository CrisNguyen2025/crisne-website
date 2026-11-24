// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupBySection } from '@/lib/roadmap/sections';
import type { ChecklistItem, RoadmapMeta } from '@/lib/roadmap/types';
import { CreateItemModal } from '@/components/roadmap/CreateItemModal';
import { EditItemInfoDrawer } from '@/components/roadmap/EditItemInfoDrawer';
import { LessonEditorialReader } from '@/components/roadmap/LessonEditorialReader';
import { SectionField } from '@/components/roadmap/SectionField';

const routerSpies = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

const serviceSpies = vi.hoisted(() => ({
  fetchRoadmapBySlug: vi.fn(),
  updateItemInfo: vi.fn(),
  updateItemContent: vi.fn(),
  updateItemStatus: vi.fn(),
  deleteItem: vi.fn(),
  fetchLessonProvenance: vi.fn(() => Promise.resolve({ provenances: [], orphans: [] })),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => routerSpies,
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) => {
    const props = { ...rest };
    delete props.prefetch;
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
}));

vi.mock('@/hooks/use-can-write', () => ({
  useCanWrite: () => true,
}));

vi.mock('@/hooks/use-media-query', () => ({
  MOBILE_VIEWPORT_QUERY: '(max-width: 767px)',
  useMediaQuery: () => false,
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/components/roadmap/EditItemContentDrawer', () => ({
  preloadLessonContentEditor: vi.fn(),
  EditItemContentDrawer: () => null,
}));

vi.mock('@/logic/roadmap/roadmapService', () => serviceSpies);

const TOPIC_AI: RoadmapMeta = {
  id: 'topic-ai',
  slug: 'ai-rag',
  title: 'AI & RAG',
  order: 1,
  sectionNames: ['Core', 'Retrieval', 'Evaluation'],
};

const TOPIC_DB: RoadmapMeta = {
  id: 'topic-db',
  slug: 'db-internals',
  title: 'Database Internals',
  order: 2,
  sectionNames: ['Storage Engine', 'Indexing'],
};

const LESSON_KB: ChecklistItem = {
  id: 'kb-core-01',
  slug: 'knowledge-base-kb',
  title: 'Knowledge Base (KB)',
  description: 'Kho tri thức nền tảng',
  section: 'Retrieval',
  order: 1,
  roadmapSlug: 'ai-rag',
  createdAt: '2026-11-18T00:00:00.000Z',
  updatedAt: '2026-11-18T00:00:00.000Z',
};

function StatefulSectionField({
  initial = '',
  sections,
}: {
  initial?: string;
  sections: string[];
}) {
  const [value, setValue] = useState(initial);
  return (
    <div>
      <SectionField value={value} onChange={setValue} sections={sections} />
      <output data-testid="section-value">{value}</output>
    </div>
  );
}

describe('SectionField 1-step Combobox & EditItemInfoDrawer / LessonEditorialReader slug UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    serviceSpies.fetchRoadmapBySlug.mockResolvedValue({
      roadmap: TOPIC_AI,
      items: [LESSON_KB],
      sections: ['Retrieval'],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('opens showing all existing sections + Chung without losing current section value', () => {
    render(<StatefulSectionField initial="Retrieval" sections={['Core', 'Retrieval', 'Evaluation']} />);

    const input = screen.getByRole('combobox', { name: 'Mục' }) as HTMLInputElement;
    expect(input.value).toBe('Retrieval');

    fireEvent.focus(input);

    const options = screen.getAllByRole('option').map((el) => el.textContent);
    expect(options).toEqual(['Chung (không thuộc mục riêng)', 'Core', 'Retrieval', 'Evaluation']);
    expect(input.value).toBe('Retrieval');

    fireEvent.click(screen.getByRole('option', { name: 'Evaluation' }));
    expect(screen.getByTestId('section-value').textContent).toBe('Evaluation');
  });

  it('filters case-insensitively, reuses canonical spelling per ADR-0009, and creates new section on typing', () => {
    render(<StatefulSectionField initial="" sections={['Cơ bản', 'RAG', 'Evaluation']} />);

    const input = screen.getByRole('combobox', { name: 'Mục' });
    fireEvent.change(input, { target: { value: 'rag' } });

    expect(screen.getByText(/Khớp mục:/)).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Tạo mục mới/ })).toBeNull();
    expect(screen.getByRole('option', { name: 'RAG' })).toBeTruthy();

    fireEvent.blur(input);
    expect(screen.getByTestId('section-value').textContent).toBe('RAG');

    fireEvent.change(input, { target: { value: 'Co ban' } });
    expect(screen.getByRole('option', { name: /Tạo mục mới “Co ban”/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Đặt về mục Chung' }));
    expect(screen.getByTestId('section-value').textContent).toBe('');
  });

  it('supports keyboard ArrowDown/Enter selection and Escape closes listbox without closing CreateItemModal', async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <CreateItemModal
        isOpen
        sections={['Core', 'Retrieval']}
        targetSection={null}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );

    const combo = screen.getByRole('combobox', { name: 'Mục' });
    fireEvent.focus(combo);
    expect(screen.getByRole('listbox')).toBeTruthy();

    fireEvent.keyDown(combo, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.change(combo, { target: { value: 'Observability' } });
    expect(screen.getByRole('listbox')).toBeTruthy();

    fireEvent.keyDown(combo, { key: 'Enter' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();

    const titleInput = screen.getByPlaceholderText(/Speculative Decoding/);
    fireEvent.change(titleInput, { target: { value: 'Langfuse Tracing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm bài' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('Observability', 'Langfuse Tracing', '', {
        openEditor: false,
      });
    });
  });

  it('syncs Slug URL from title, previews normalized /<topic>/<slug>, and rejects blank Slug URL instead of silently ignoring', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <EditItemInfoDrawer
        isOpen
        item={LESSON_KB}
        sections={['Core', 'Retrieval']}
        topics={[TOPIC_AI, TOPIC_DB]}
        currentTopicSlug="ai-rag"
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );

    const slugInput = screen.getByLabelText('Slug URL') as HTMLInputElement;
    expect(slugInput.value).toBe('knowledge-base-kb');
    expect(screen.getByText('/ai-rag/knowledge-base-kb')).toBeTruthy();

    fireEvent.change(slugInput, { target: { value: '   ' } });
    expect(screen.getByText(/Slug URL đang để trống/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Lưu thay đổi/ }));
    expect(screen.getByText(/Slug URL không được để trống/)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    const titleInput = screen.getByLabelText('Tiêu đề');
    fireEvent.change(titleInput, { target: { value: 'Knowledge Base' } });
    fireEvent.click(screen.getByRole('button', { name: /Đồng bộ từ tiêu đề/ }));

    expect(slugInput.value).toBe('knowledge-base');
    expect(screen.getByText('/ai-rag/knowledge-base')).toBeTruthy();
    expect(screen.getByText(/Tự động chuyển hướng 308 từ \/ai-rag\/knowledge-base-kb/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Lưu thay đổi/ }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        'kb-core-01',
        'Knowledge Base',
        'Kho tri thức nền tảng',
        undefined,
        { slug: 'knowledge-base' }
      );
    });
  });

  it('updates SectionField options dynamically when switching Topic in EditItemInfoDrawer', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <EditItemInfoDrawer
        isOpen
        item={LESSON_KB}
        sections={['Core', 'Retrieval', 'Evaluation']}
        topics={[TOPIC_AI, TOPIC_DB]}
        currentTopicSlug="ai-rag"
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    const topicSelect = screen.getByLabelText('Topic') as HTMLSelectElement;
    const sectionCombo = screen.getByRole('combobox', { name: 'Mục' }) as HTMLInputElement;
    expect(sectionCombo.value).toBe('Retrieval');

    fireEvent.change(topicSelect, { target: { value: 'db-internals' } });
    expect(sectionCombo.value).toBe('');

    fireEvent.change(topicSelect, { target: { value: 'ai-rag' } });
    expect(sectionCombo.value).toBe('Retrieval');

    fireEvent.change(topicSelect, { target: { value: 'db-internals' } });
    expect(sectionCombo.value).toBe('');

    fireEvent.focus(sectionCombo);
    const listbox = screen.getByRole('listbox');
    const dbOptions = within(listbox)
      .getAllByRole('option')
      .map((el) => el.textContent);
    expect(dbOptions).toEqual(['Chung (không thuộc mục riêng)', 'Storage Engine', 'Indexing']);

    fireEvent.click(within(listbox).getByRole('option', { name: 'Indexing' }));
    expect(sectionCombo.value).toBe('Indexing');

    fireEvent.change(topicSelect, { target: { value: 'ai-rag' } });
    expect(sectionCombo.value).toBe('Retrieval');

    fireEvent.change(topicSelect, { target: { value: 'db-internals' } });
    fireEvent.focus(sectionCombo);
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Indexing' }));
    fireEvent.click(screen.getByRole('button', { name: /Lưu thay đổi/ }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        'kb-core-01',
        'Knowledge Base (KB)',
        'Kho tri thức nền tảng',
        'Indexing',
        { roadmapSlug: 'db-internals' }
      );
    });
  });

  it('avoids router.refresh() race on old URL when LessonEditorialReader navigates to updated slug', async () => {
    serviceSpies.updateItemInfo.mockResolvedValueOnce({
      item: { ...LESSON_KB, title: 'Knowledge Base', slug: 'knowledge-base' },
    });

    const groups = groupBySection([LESSON_KB], ['Retrieval']);
    render(
      <LessonEditorialReader
        lesson={LESSON_KB}
        processedHtml="<p>Body</p>"
        headings={[]}
        topic={TOPIC_AI}
        siblingGroups={groups}
        allTopics={[TOPIC_AI, TOPIC_DB]}
      />
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Thao tác bài học' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Sửa bài học' }));
    const slugInput = screen.getByLabelText('Slug URL');
    fireEvent.change(slugInput, { target: { value: 'knowledge-base' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu thay đổi/ }));

    await waitFor(() => {
      expect(routerSpies.replace).toHaveBeenCalledWith('/ai-rag/knowledge-base');
    });
    expect(routerSpies.refresh).not.toHaveBeenCalled();

    routerSpies.replace.mockClear();
    routerSpies.refresh.mockClear();
    serviceSpies.updateItemInfo.mockResolvedValueOnce({
      item: { ...LESSON_KB, title: 'Knowledge Base Updated' },
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Thao tác bài học' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Sửa bài học' }));
    const titleInput = screen.getByLabelText('Tiêu đề');
    fireEvent.change(titleInput, { target: { value: 'Knowledge Base Updated' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu thay đổi/ }));

    await waitFor(() => {
      expect(routerSpies.refresh).toHaveBeenCalledTimes(1);
    });
    expect(routerSpies.replace).not.toHaveBeenCalled();
  });

  it('navigates to the new Topic URL when LessonEditorialReader moves the lesson without changing its slug', async () => {
    serviceSpies.updateItemInfo.mockResolvedValueOnce({ item: { ...LESSON_KB } });

    const groups = groupBySection([LESSON_KB], ['Retrieval']);
    render(
      <LessonEditorialReader
        lesson={LESSON_KB}
        processedHtml="<p>Body</p>"
        headings={[]}
        topic={TOPIC_AI}
        siblingGroups={groups}
        allTopics={[TOPIC_AI, TOPIC_DB]}
      />
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Thao tác bài học' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Sửa bài học' }));
    fireEvent.change(screen.getByLabelText('Topic'), { target: { value: 'db-internals' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu thay đổi/ }));

    await waitFor(() => {
      expect(routerSpies.replace).toHaveBeenCalledWith('/db-internals/knowledge-base-kb');
    });
    expect(routerSpies.refresh).not.toHaveBeenCalled();
  });

  it('highlights exact match over prefix match, ignores IME composition Enter, and handles empty sections', () => {
    const { unmount } = render(
      <StatefulSectionField initial="" sections={['AI Core', 'Core']} />
    );

    const input = screen.getByRole('combobox', { name: 'Mục' });
    fireEvent.change(input, { target: { value: 'core' } });

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(screen.getByRole('listbox')).toBeTruthy();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('section-value').textContent).toBe('Core');
    unmount();

    render(<StatefulSectionField initial="" sections={[]} />);
    const emptyInput = screen.getByRole('combobox', { name: 'Mục' });
    fireEvent.focus(emptyInput);
    expect(screen.getByText(/Topic chưa có mục riêng/)).toBeTruthy();

    fireEvent.change(emptyInput, { target: { value: 'Nền tảng' } });
    expect(screen.getByRole('option', { name: /Tạo mục mới “Nền tảng”/ })).toBeTruthy();
  });
});
