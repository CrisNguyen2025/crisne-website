"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Tag,
  ExternalLink,
  Trash2,
  X,
  Loader2,
  BookOpen,
  ChevronDown,
  Pencil,
  Check,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TagType {
  id: string;
  name: string;
  color: string;
  prompt: string | null;
  _count: { notes: number };
}

interface NoteType {
  id: string;
  title: string;
  link: string | null;
  description: string | null;
  tagId: string | null;
  tag: TagType | null;
  createdAt: string;
}

// ─── Tag colors palette ───────────────────────────────────────────────────────

const TAG_COLORS = [
  "#6b9ac4",
  "#8bb5d9",
  "#4a7a9b",
  "#7c9e6e",
  "#a8c99a",
  "#c4a96b",
  "#c46b6b",
  "#9b6bc4",
  "#6bc4b8",
];

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

// ─── NoteCard ─────────────────────────────────────────────────────────────────

function NoteCard({
  note,
  tags,
  onDelete,
  onUpdate,
}: {
  note: NoteType;
  tags: TagType[];
  onDelete: (id: string) => void;
  onUpdate: (note: NoteType) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const [editTitle, setEditTitle] = useState(note.title);
  const [editLink, setEditLink] = useState(note.link ?? "");
  const [editDescription, setEditDescription] = useState(
    note.description ?? "",
  );
  const [editTagId, setEditTagId] = useState(note.tagId ?? "");
  const [saving, setSaving] = useState(false);

  const openEdit = () => {
    setEditTitle(note.title);
    setEditLink(note.link ?? "");
    setEditDescription(note.description ?? "");
    setEditTagId(note.tagId ?? "");
    setEditing(true);
    setMenuOpen(false);
  };

  const handleSave = async () => {
    if (!editTitle.trim()) return;
    setSaving(true);
    try {
      const updated = await apiFetch<NoteType>(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          link: editLink || null,
          description: editDescription || null,
          tagId: editTagId || null,
        }),
      });
      onUpdate(updated);
      setEditing(false);
    } catch {
      // keep editing open on error
    } finally {
      setSaving(false);
    }
  };

  // ── Edit mode ──
  if (editing) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-3 rounded-xl bg-card ring-2 ring-ring/40 p-4"
      >
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          placeholder="Title"
          className="w-full rounded-lg bg-muted/50 border border-border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
          autoFocus
        />
        <input
          type="url"
          value={editLink}
          onChange={(e) => setEditLink(e.target.value)}
          placeholder="https://..."
          className="w-full rounded-lg bg-muted/50 border border-border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
        />
        <div className="relative">
          <select
            value={editTagId}
            onChange={(e) => setEditTagId(e.target.value)}
            className="w-full appearance-none rounded-lg bg-muted/50 border border-border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/50 pr-7"
          >
            <option value="">No tag</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
        </div>
        <textarea
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          placeholder="Description…"
          rows={3}
          className="w-full rounded-lg bg-muted/50 border border-border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/50 resize-none"
        />
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="xs" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button
            size="xs"
            onClick={handleSave}
            disabled={saving || !editTitle.trim()}
          >
            {saving ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Check className="size-3" />
            )}
            Save
          </Button>
        </div>
      </motion.div>
    );
  }

  // ── View mode ──
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="group relative flex flex-col gap-3 rounded-xl bg-card ring-1 ring-foreground/10 p-4 hover:ring-foreground/20 transition-all"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm leading-snug truncate">
            {note.title}
          </h3>
          {note.link && (
            <a
              href={normalizeLink(note.link)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-steel mt-0.5 transition-colors truncate max-w-full"
            >
              <ExternalLink className="size-3 shrink-0" />
              <span className="truncate">{note.link}</span>
            </a>
          )}
        </div>

        {/* Actions menu */}
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
            aria-label="Note options"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
          <AnimatePresence>
            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMenuOpen(false)}
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  transition={{ duration: 0.1 }}
                  className="absolute right-0 top-7 z-20 w-36 rounded-xl bg-card border border-border shadow-lg overflow-hidden"
                >
                  <button
                    onClick={openEdit}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left hover:bg-muted/60 transition-colors"
                  >
                    <Pencil className="size-3 text-muted-foreground" />
                    Edit
                  </button>
                  <div className="h-px bg-border mx-2" />
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete(note.id);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="size-3" />
                    Delete
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Tag */}
      {note.tag && (
        <div>
          <Badge
            variant="outline"
            className="text-xs gap-1"
            style={{
              borderColor: note.tag.color + "60",
              color: note.tag.color,
            }}
          >
            <span
              className="size-1.5 rounded-full"
              style={{ background: note.tag.color }}
            />
            {note.tag.name}
          </Badge>
        </div>
      )}

      {/* Description */}
      {note.description && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          {note.description}
        </p>
      )}
    </motion.div>
  );
}

// ─── AddNoteInline ────────────────────────────────────────────────────────────

function AddNoteInline({
  tagId,
  onAdd,
  onCancel,
}: {
  tagId: string;
  onAdd: (note: NoteType) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError("");
    try {
      const note = await apiFetch<NoteType>("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, link: link || null, tagId }),
      });
      onAdd(note);
      onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create note");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="flex items-center gap-2"
    >
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Note title…"
        className="flex-1 rounded-lg bg-background border border-border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
      />
      <input
        type="url"
        value={link}
        onChange={(e) => setLink(e.target.value)}
        placeholder="https://... (optional)"
        className="w-56 rounded-lg bg-background border border-border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
      />
      {error && <p className="text-xs text-destructive shrink-0">{error}</p>}
      <div className="flex gap-1.5 shrink-0">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={loading || !title.trim()}>
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
          Add
        </Button>
      </div>
    </motion.form>
  );
}

function EditTagInline({
  tag,
  onSave,
  onCancel,
}: {
  tag: TagType;
  onSave: (updated: TagType) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const updated = await apiFetch<TagType>(`/api/tags/${tag.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color }),
      });
      onSave({ ...updated, _count: tag._count });
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="flex flex-col gap-2 p-2.5 rounded-xl bg-muted/40 border border-border"
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg bg-background border border-border px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring/50"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave();
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className="flex gap-1.5 flex-wrap">
        {TAG_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={cn(
              "size-4 rounded-full transition-transform hover:scale-110",
              color === c &&
                "ring-2 ring-offset-1 ring-foreground/30 scale-110",
            )}
            style={{ background: c }}
          />
        ))}
      </div>
      <div className="flex gap-1.5 justify-end">
        <Button variant="ghost" size="xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="xs"
          onClick={handleSave}
          disabled={loading || !name.trim()}
        >
          {loading ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Check className="size-3" />
          )}
          Save
        </Button>
      </div>
    </motion.div>
  );
}

function QuickAddTag({ onAdd }: { onAdd: (tag: TagType) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(TAG_COLORS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError("");
    try {
      const tag = await apiFetch<TagType>("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color }),
      });
      onAdd(tag);
      setName("");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tag");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors border border-dashed border-border"
      >
        <Plus className="size-3" />
        New tag
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-xl bg-muted/60 border border-border"
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tag name"
        className="w-24 rounded-md bg-background border border-border px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring/50"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setName("");
          }
        }}
      />
      {/* Color dots */}
      <div className="flex gap-1">
        {TAG_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={cn(
              "size-3.5 rounded-full transition-transform hover:scale-110 shrink-0",
              color === c &&
                "ring-2 ring-offset-1 ring-foreground/30 scale-110",
            )}
            style={{ background: c }}
          />
        ))}
      </div>
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button
        type="submit"
        size="xs"
        disabled={loading || !name.trim()}
        className="shrink-0"
      >
        {loading ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Check className="size-3" />
        )}
      </Button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setName("");
        }}
        className="p-0.5 text-muted-foreground hover:text-foreground"
      >
        <X className="size-3" />
      </button>
    </form>
  );
}

// ─── normalizeLink — ensure any text becomes a clickable URL ─────────────────

function normalizeLink(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  // Already has a protocol
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)) return trimmed;
  // Looks like an email
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return `mailto:${trimmed}`;
  // Fallback: prepend https://
  return `https://${trimmed}`;
}

// ─── QuickNoteForm ────────────────────────────────────────────────────────────

function QuickNoteForm({
  tagId,
  onAdd,
}: {
  tagId: string;
  onAdd: (note: NoteType) => void;
}) {
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    try {
      const note = await apiFetch<NoteType>("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          link: link.trim() ? normalizeLink(link.trim()) : null,
          tagId,
        }),
      });
      onAdd(note);
      setTitle("");
      setLink("");
      titleRef.current?.focus();
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 px-3 py-2.5 border-t border-border/40 bg-muted/20 rounded-b-xl"
    >
      <Plus className="size-3.5 text-muted-foreground/40 shrink-0" />
      <input
        ref={titleRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Quick add…"
        className="flex-1 min-w-0 bg-transparent text-xs outline-none placeholder:text-muted-foreground/40"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setTitle("");
            setLink("");
          }
        }}
      />
      <AnimatePresence>
        {title.trim() && (
          <motion.input
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 130, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            type="text"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Link (optional)"
            className="bg-transparent text-xs outline-none placeholder:text-muted-foreground/40 min-w-0 shrink-0"
            style={{ width: 130 }}
          />
        )}
      </AnimatePresence>
      {title.trim() && (
        <button
          type="submit"
          disabled={loading}
          className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
        </button>
      )}
    </form>
  );
}

function TagPill({
  tag,
  isActive,
  addingNoteTagId,
  onSelect,
  onAddNote,
  onEdit,
  onDelete,
}: {
  tag: TagType;
  isActive: boolean;
  addingNoteTagId: string | null;
  onSelect: () => void;
  onAddNote: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const pillRef = useRef<HTMLButtonElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hovered, setHovered] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });

  const updatePos = () => {
    if (!pillRef.current) return;
    const rect = pillRef.current.getBoundingClientRect();
    setTooltipPos({
      top: rect.top + window.scrollY - 8,
      left: rect.left + rect.width / 2 + window.scrollX,
    });
  };

  const show = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    updatePos();
    setHovered(true);
  };

  const hide = () => {
    hideTimer.current = setTimeout(() => setHovered(false), 80);
  };

  const cancelHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  };

  return (
    <div className="relative shrink-0">
      <button
        ref={pillRef}
        onClick={onSelect}
        onMouseEnter={show}
        onMouseLeave={hide}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all",
          isActive
            ? "text-background"
            : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted",
        )}
        style={isActive ? { background: tag.color } : undefined}
      >
        <span
          className="size-1.5 rounded-full shrink-0"
          style={{ background: isActive ? "rgba(255,255,255,0.7)" : tag.color }}
        />
        {tag.name}
        <span
          className={cn(
            "text-[10px] tabular-nums",
            isActive ? "opacity-70" : "opacity-50",
          )}
        >
          {tag._count.notes}
        </span>
      </button>

      {hovered &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            onMouseEnter={cancelHide}
            onMouseLeave={hide}
            style={{
              position: "absolute",
              top: tooltipPos.top,
              left: tooltipPos.left,
              transform: "translate(-50%, -100%)",
              zIndex: 99999,
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="flex items-center gap-px bg-popover border border-border/60 rounded-full px-1.5 py-1 shadow-xl whitespace-nowrap mb-1.5"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddNote();
                  setHovered(false);
                }}
                className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                title="Add note"
              >
                <Plus className="size-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                  setHovered(false);
                }}
                className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                title="Edit tag"
              >
                <Pencil className="size-3" />
              </button>
              <div className="w-px h-3 bg-border/60 mx-0.5" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                  setHovered(false);
                }}
                className="p-1 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Delete tag"
              >
                <X className="size-3" />
              </button>
            </motion.div>
            {/* Arrow */}
            <div
              className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
              style={{ bottom: "calc(1.5rem - 5px)" }}
            >
              <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-l-transparent border-r-transparent border-t-border/60" />
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-px w-0 h-0 border-l-[4px] border-r-[4px] border-t-[4px] border-l-transparent border-r-transparent border-t-popover" />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

// ─── Main ToolsClient ─────────────────────────────────────────────────────────

export function ToolsClient() {
  const [tags, setTags] = useState<TagType[]>([]);
  const [notes, setNotes] = useState<NoteType[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [addingNoteTagId, setAddingNoteTagId] = useState<string | null>(null);

  // Load tags + notes
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tagsData, notesData] = await Promise.all([
        apiFetch<TagType[]>("/api/tags"),
        apiFetch<NoteType[]>("/api/notes"),
      ]);
      setTags(tagsData);
      setNotes(notesData);
    } catch {
      // silent fail on initial load
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddTag = (tag: TagType) => {
    setTags((prev) => [...prev, { ...tag, _count: { notes: 0 } }]);
  };

  const handleDeleteTag = async (id: string) => {
    const tag = tags.find((t) => t.id === id);
    if (tag && tag._count && tag._count.notes > 0) {
      alert(`Cannot delete tag "${tag.name}" because it contains notes.`);
      return;
    }
    if (tag && !confirm(`Delete tag "${tag.name}"?`)) {
      return;
    }
    try {
      await apiFetch(`/api/tags/${id}`, { method: "DELETE" });
      setTags((prev) => prev.filter((t) => t.id !== id));
      if (activeTag === id) setActiveTag(null);
    } catch (err: any) {
      alert(err?.message || "Failed to delete tag because it contains posts.");
    }
  };

  const handleAddNote = (note: NoteType) => {
    setNotes((prev) => [note, ...prev]);
    // Update tag count
    if (note.tagId) {
      setTags((prev) =>
        prev.map((t) =>
          t.id === note.tagId
            ? { ...t, _count: { notes: t._count.notes + 1 } }
            : t,
        ),
      );
    }
  };

  const handleDeleteNote = async (id: string) => {
    const note = notes.find((n) => n.id === id);
    try {
      await apiFetch(`/api/notes/${id}`, { method: "DELETE" });
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (note?.tagId) {
        setTags((prev) =>
          prev.map((t) =>
            t.id === note.tagId
              ? { ...t, _count: { notes: Math.max(0, t._count.notes - 1) } }
              : t,
          ),
        );
      }
    } catch {
      // silent
    }
  };

  const handleUpdateNote = (updated: NoteType) => {
    setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
    // Recalculate tag counts after potential tag change
    setTags((prev) =>
      prev.map((t) => ({
        ...t,
        _count: {
          notes: notes.filter((n) =>
            n.id === updated.id ? updated.tagId === t.id : n.tagId === t.id,
          ).length,
        },
      })),
    );
  };

  const handleUpdateTag = (updated: TagType) => {
    setTags((prev) =>
      prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)),
    );
    setEditingTagId(null);
  };

  const filteredNotes = activeTag
    ? notes.filter((n) => n.tagId === activeTag)
    : notes;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50 bg-background/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BookOpen className="size-4 text-steel" />
            <span className="font-heading font-semibold text-sm">Notes</span>
          </div>
        </div>

        {/* ── Tag bar ── */}
        <div
          className="border-t border-border/40 z-50"
          style={{ overflow: "visible" }}
        >
          <div
            className="max-w-5xl mx-auto px-6"
            style={{ overflow: "visible" }}
          >
            <div
              className="flex items-center gap-1.5 overflow-x-auto py-3 scrollbar-none"
              style={{ overflowY: "visible" }}
            >
              {/* All pill */}
              <button
                onClick={() => setActiveTag(null)}
                className={cn(
                  "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                  activeTag === null
                    ? "bg-foreground text-background"
                    : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                All
                <span
                  className={cn(
                    "text-[10px] tabular-nums",
                    activeTag === null ? "opacity-70" : "opacity-50",
                  )}
                >
                  {notes.length}
                </span>
              </button>

              {/* Tag pills */}
              <AnimatePresence mode="popLayout">
                {tags.map((tag) => (
                  <motion.div
                    key={tag.id}
                    layout
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    className="shrink-0"
                  >
                    {editingTagId === tag.id ? (
                      <EditTagInline
                        tag={tag}
                        onSave={(updated) =>
                          handleUpdateTag({ ...updated, _count: tag._count })
                        }
                        onCancel={() => setEditingTagId(null)}
                      />
                    ) : (
                      <TagPill
                        tag={tag}
                        isActive={activeTag === tag.id}
                        addingNoteTagId={addingNoteTagId}
                        onSelect={() =>
                          setActiveTag(tag.id === activeTag ? null : tag.id)
                        }
                        onAddNote={() =>
                          setAddingNoteTagId(
                            addingNoteTagId === tag.id ? null : tag.id,
                          )
                        }
                        onEdit={() => setEditingTagId(tag.id)}
                        onDelete={() => handleDeleteTag(tag.id)}
                      />
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Divider */}
              {tags.length > 0 && (
                <div className="shrink-0 w-px h-4 bg-border/60 mx-0.5" />
              )}

              {/* Quick add tag */}
              <QuickAddTag onAdd={handleAddTag} />
            </div>
          </div>
        </div>
      </div>

      {/* Add note inline form (below tag bar, above notes) */}
      <AnimatePresence>
        {addingNoteTagId && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-b border-border/40 bg-muted/20"
          >
            <div className="max-w-5xl mx-auto px-6 py-3">
              <AddNoteInline
                tagId={addingNoteTagId}
                onAdd={(note) => {
                  handleAddNote(note);
                  setAddingNoteTagId(null);
                }}
                onCancel={() => setAddingNoteTagId(null)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notes grid */}
      <main className="max-w-5xl mx-auto px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : activeTag ? (
          // ── Single tag view ──
          (() => {
            const tag = tags.find((t) => t.id === activeTag);
            return (
              <div className="flex flex-col gap-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <AnimatePresence mode="popLayout">
                    {filteredNotes.map((note) => (
                      <NoteCard
                        key={note.id}
                        note={note}
                        tags={tags}
                        onDelete={handleDeleteNote}
                        onUpdate={handleUpdateNote}
                      />
                    ))}
                  </AnimatePresence>
                </div>
                {filteredNotes.length === 0 && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-sm text-muted-foreground text-center py-10"
                  >
                    No notes in this tag yet
                  </motion.p>
                )}
                {tag && <QuickNoteForm tagId={tag.id} onAdd={handleAddNote} />}
              </div>
            );
          })()
        ) : notes.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20 gap-2 text-center"
          >
            <BookOpen className="size-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No notes yet — select a tag to get started
            </p>
          </motion.div>
        ) : (
          // ── All tags view — grouped ──
          <div className="flex flex-col gap-8">
            {tags.map((tag) => {
              const tagNotes = notes.filter((n) => n.tagId === tag.id);
              return (
                <motion.div
                  key={tag.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col gap-3"
                >
                  {/* Tag group header */}
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: tag.color }}
                    />
                    <span className="text-xs font-medium text-muted-foreground">
                      {tag.name}
                    </span>
                    <span className="text-xs text-muted-foreground/50">
                      {tagNotes.length}
                    </span>
                  </div>

                  {/* Notes + quick add */}
                  <div className="rounded-xl ring-1 ring-foreground/8 overflow-hidden">
                    {tagNotes.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3">
                        <AnimatePresence mode="popLayout">
                          {tagNotes.map((note) => (
                            <NoteCard
                              key={note.id}
                              note={note}
                              tags={tags}
                              onDelete={handleDeleteNote}
                              onUpdate={handleUpdateNote}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    )}
                    <QuickNoteForm tagId={tag.id} onAdd={handleAddNote} />
                  </div>
                </motion.div>
              );
            })}

            {/* Notes without tag */}
            {(() => {
              const untagged = notes.filter((n) => !n.tagId);
              if (untagged.length === 0) return null;
              return (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col gap-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-muted-foreground/30" />
                    <span className="text-xs font-medium text-muted-foreground">
                      Untagged
                    </span>
                    <span className="text-xs text-muted-foreground/50">
                      {untagged.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <AnimatePresence mode="popLayout">
                      {untagged.map((note) => (
                        <NoteCard
                          key={note.id}
                          note={note}
                          tags={tags}
                          onDelete={handleDeleteNote}
                          onUpdate={handleUpdateNote}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })()}
          </div>
        )}
      </main>
    </div>
  );
}
