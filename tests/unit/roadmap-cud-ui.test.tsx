// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ChecklistItem, RoadmapMeta } from '@/lib/roadmap/types';
import { ActionMenu } from '@/components/ui/action-menu';
import { ConfirmDeleteModal } from '@/components/roadmap/ConfirmDeleteModal';
import { CreateItemModal } from '@/components/roadmap/CreateItemModal';
import { CreateTopicModal } from '@/components/roadmap/CreateTopicModal';
import { EditItemContentDrawer } from '@/components/roadmap/EditItemContentDrawer';
import { EditItemInfoDrawer } from '@/components/roadmap/EditItemInfoDrawer';
import { EditSectionModal } from '@/components/roadmap/EditSectionModal';
import { EditTopicModal } from '@/components/roadmap/EditTopicModal';
import { TopicEditorialPage } from '@/components/roadmap/TopicEditorialPage';
import { isRoadmapWriteTool } from '@/logic/roadmap/roadmapAssistantService';
import * as roadmapService from '@/logic/roadmap/roadmapService';

const routerSpies = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
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

vi.mock('@/components/ui/editor/Editor', () => ({
  default: function MockEditor({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
  }) {
    React.useEffect(() => {
      onChange(value);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return (
      <textarea
        aria-label="Trình soạn thảo"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  },
}));

vi.mock('@/logic/roadmap/roadmapService', () => ({
  fetchRoadmapBySlug: vi.fn().mockResolvedValue({ items: [], sections: [] }),
  createItem: vi.fn(),
  reorderItems: vi.fn(),
  updateRoadmapBySlug: vi.fn(),
  deleteRoadmapBySlug: vi.fn(),
  renameSection: vi.fn(),
  dissolveSection: vi.fn(),
  fetchOwnerStatuses: vi.fn().mockResolvedValue({ statuses: {} }),
}));

const TOPIC: RoadmapMeta & { updatedAt: string } = {
  id: 'topic-1',
  slug: 'ai-engineering',
  title: 'AI Engineering',
  description: 'Lộ trình AI',
  order: 1,
  sectionNames: ['Nền tảng'],
  updatedAt: '2026-11-22T00:00:00.000Z',
};

const LESSON: ChecklistItem = {
  id: 'item-1',
  slug: 'attention',
  title: 'Attention',
  description: 'Cơ chế chú ý',
  section: 'Nền tảng',
  order: 1,
  roadmapSlug: 'ai-engineering',
  content: '<p>Nội dung ban đầu</p>',
  createdAt: '2026-11-22T00:00:00.000Z',
  updatedAt: '2026-11-22T00:00:00.000Z',
};

describe('Roadmap CUD UI/UX upgrades', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    document.body.style.overflow = '';
  });

  it('connects labels, clears validation errors on input, and supports Ctrl+Enter in CreateTopicModal & EditTopicModal', async () => {
    const onCreateSubmit = vi.fn().mockRejectedValueOnce(new Error('Trùng slug')).mockResolvedValueOnce(undefined);
    const onCreateClose = vi.fn();

    const { unmount } = render(
      <CreateTopicModal isOpen onClose={onCreateClose} onSubmit={onCreateSubmit} />
    );

    const heading = screen.getByRole('heading', { level: 2, name: 'Tạo topic' });
    expect(heading.className).toContain('font-display');
    expect(screen.queryByText('Tuỳ chọn')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Tạo topic' }));
    expect(screen.getByRole('alert').textContent).toContain('Nhập tên topic.');

    const nameInput = screen.getByLabelText(/Tên topic/);
    expect(nameInput.getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(nameInput, { target: { value: 'Agents' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(nameInput.getAttribute('aria-invalid')).toBeNull();

    const descInput = screen.getByLabelText(/Mô tả/);
    fireEvent.keyDown(descInput, { key: 'Enter', ctrlKey: true });

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Trùng slug');
    expect(onCreateClose).not.toHaveBeenCalled();

    fireEvent.keyDown(descInput, { key: 'Enter', metaKey: true });
    await waitFor(() => {
      expect(onCreateClose).toHaveBeenCalledTimes(1);
    });
    unmount();

    const onEditSubmit = vi.fn().mockResolvedValue(undefined);
    const onEditClose = vi.fn();
    render(<EditTopicModal isOpen topic={TOPIC} onClose={onEditClose} onSubmit={onEditSubmit} />);

    fireEvent.change(screen.getByLabelText(/Tên topic/), { target: { value: 'Applied AI' } });
    fireEvent.keyDown(screen.getByLabelText(/Mô tả/), { key: 'Enter', ctrlKey: true });

    await waitFor(() => {
      expect(onEditSubmit).toHaveBeenCalledWith('Applied AI', 'Lộ trình AI');
      expect(onEditClose).toHaveBeenCalledTimes(1);
    });
  });

  it('tracks individual button spinner on Tạo & viết nội dung in CreateItemModal and stays open on failure', async () => {
    let rejectPromise: (err: Error) => void = () => {};
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          rejectPromise = reject;
        })
    );
    const onClose = vi.fn();

    render(
      <CreateItemModal
        isOpen
        sections={['Nền tảng']}
        targetSection="Nền tảng"
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );

    fireEvent.change(screen.getByLabelText(/Tên bài/), { target: { value: 'Tool Use' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo & viết nội dung' }));

    expect(screen.getByRole('button', { name: 'Đang mở trình soạn…' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thêm bài' })).toBeTruthy();

    await act(async () => {
      rejectPromise(new Error('Không tạo được bài'));
    });

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Không tạo được bài');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('awaits async rename, shows progressive merge hint, displays errors, and skips unchanged submit in EditSectionModal', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error('Lỗi server'));
    const onClose = vi.fn();

    const { rerender } = render(
      <EditSectionModal
        isOpen
        section="Nền tảng"
        existingSections={['Nền tảng', 'Nâng cao']}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );

    expect(screen.queryByText(/Trùng mục sẵn có/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    rerender(
      <EditSectionModal
        isOpen
        section="Cơ bản"
        existingSections={['Cơ bản', 'Nâng cao']}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );

    fireEvent.change(screen.getByLabelText(/Tên mục/), { target: { value: 'Nâng cao' } });
    expect(screen.getByText(/Trùng mục sẵn có/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Lỗi server');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders editorial font heading, concise copy, error alert, dirty badge, and clean Escape discard handling in EditItemContentDrawer', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error('Mất kết nối'));
    const onClose = vi.fn();

    render(
      <EditItemContentDrawer isOpen item={LESSON} onClose={onClose} onSubmit={onSubmit} />
    );

    const heading = screen.getByRole('heading', { level: 2, name: LESSON.title });
    expect(heading.className).toContain('font-display');
    expect(screen.queryByText('Chỉnh sửa nội dung')).toBeNull();
    expect(screen.queryByText('Chưa lưu')).toBeNull();

    const editor = await screen.findByLabelText('Trình soạn thảo', {}, { timeout: 2000 });

    fireEvent.change(editor, { target: { value: '<p>Nội dung mới chỉnh sửa</p>' } });
    expect(screen.getByText('Chưa lưu')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu nội dung' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Mất kết nối');
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(screen.getByText('Bỏ thay đổi chưa lưu?')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Bỏ thay đổi' })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('prevents closing EditItemInfoDrawer while saving, hides static SEO note until slug changes, and handles save', async () => {
    let resolveSave: () => void = () => {};
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        })
    );
    const onClose = vi.fn();

    render(
      <EditItemInfoDrawer
        isOpen
        item={LESSON}
        sections={['Nền tảng']}
        topics={[TOPIC]}
        currentTopicSlug={TOPIC.slug}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Chỉnh sửa bài học' }).className).toContain(
      'font-display'
    );
    expect(screen.queryByText('Giữ nguyên để ổn định link SEO.')).toBeNull();

    fireEvent.keyDown(screen.getByLabelText(/Mô tả ngắn/), { key: 'Enter', ctrlKey: true });
    expect(screen.getByRole('button', { name: 'Đang lưu…' })).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      resolveSave();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses Vietnamese Hủy in ActionMenu confirm, renders section menu in TopicEditorialPage, and keeps CreateItemModal open on API error', async () => {
    vi.mocked(roadmapService.createItem).mockRejectedValueOnce(new Error('Slug đã tồn tại'));

    render(
      <>
        <ActionMenu
          label="Menu thử"
          items={[
            {
              label: 'Xoá thử',
              danger: true,
              confirm: { title: 'Chắc chắn xoá?', confirmLabel: 'Xoá ngay' },
              onSelect: vi.fn(),
            },
          ]}
        />
        <TopicEditorialPage
          topic={TOPIC}
          initialItems={[LESSON]}
          initialSections={['Nền tảng']}
        />
      </>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Menu thử' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Xoá thử' }));
    expect(screen.getByRole('button', { name: 'Hủy' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();

    const secMenuBtn = screen.getByRole('button', { name: 'Thao tác mục Nền tảng' });
    fireEvent.click(secMenuBtn);
    expect(screen.getByRole('menuitem', { name: 'Đổi tên mục' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Bỏ mục (về Chung)' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Thêm bài' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Tên bài/), { target: { value: 'Attention' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Thêm bài' }));

    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    expect(within(dialog).getByRole('alert').textContent).toContain('Slug đã tồn tại');
    expect((within(dialog).getByLabelText(/Tên bài/) as HTMLInputElement).value).toBe('Attention');

    render(
      <ConfirmDeleteModal
        isOpen
        title="Xoá bài?"
        description="Nội dung bài học sẽ mất."
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText('Nội dung bài học sẽ mất.')).toBeTruthy();
    expect(screen.queryByText('Hành động này không thể hoàn tác.')).toBeNull();
  });

  it('classifies write tools and excludes draft, quiz, and read-only tools in isRoadmapWriteTool', () => {
    const writeTools = [
      'create_item',
      'update_item',
      'update_item_content',
      'delete_item',
      'generate_topic',
      'reorder_items',
      'rename_section',
      'import_items_from_text',
      'mark_lesson_reviewed',
      'promote_concept_to_lesson',
      'save_owner_memory',
      'archive_owner_memory',
    ];
    for (const tool of writeTools) {
      expect(isRoadmapWriteTool(tool)).toBe(true);
    }

    const nonWriteTools = [
      'draft_item_content',
      'start_lesson_quiz',
      'grade_lesson_quiz',
      'list_topics',
      'list_owner_memories',
      'get_lesson_status',
    ];
    for (const tool of nonWriteTools) {
      expect(isRoadmapWriteTool(tool)).toBe(false);
    }
  });
});
