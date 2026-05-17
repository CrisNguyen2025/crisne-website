"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  X,
  Pencil,
  Trash2,
  Search,
  Sparkles,
  BookOpen,
  Folder,
  Calendar,
  ArrowRight,
  CornerDownRight,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PostWithTags, TagWithPostCount } from "@/lib/notion-types";

const PRESET_COLORS = [
  "#6b9ac4",
  "#8bb5d9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
];

export function NotesClient() {
  const searchParams = useSearchParams();
  const [posts, setPosts] = useState<PostWithTags[]>([]);
  const [tags, setTags] = useState<TagWithPostCount[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [localSearch, setLocalSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(localSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch]);

  // Active tab: "all" | tag.id — synced with ?tab= param
  const [activeTab, setActiveTab] = useState<string>(
    searchParams.get("tab") ?? "all",
  );

  const switchTab = useCallback((tabId: string) => {
    setActiveTab(tabId);
    setLocalSearch("");
    const params = new URLSearchParams(window.location.search);
    if (tabId === "all") {
      params.delete("tab");
    } else {
      params.set("tab", tabId);
    }
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `/notes?${qs}` : "/notes");
  }, []);

  // Form states
  const [showPostForm, setShowPostForm] = useState(false);
  const [editingPost, setEditingPost] = useState<PostWithTags | null>(null);
  const [showTagForm, setShowTagForm] = useState(false);
  const [editingTag, setEditingTag] = useState<TagWithPostCount | null>(null);
  const [showTagManager, setShowTagManager] = useState(false);

  // Sliding indicator (navbar pattern)
  const tabBarRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState<{
    left: number;
    width: number;
  } | null>(null);

  useEffect(() => {
    const bar = tabBarRef.current;
    if (!bar) return;
    const el = tabRefs.current.get(activeTab);
    if (!el) {
      setIndicator(null);
      return;
    }
    const barRect = bar.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    setIndicator({ left: elRect.left - barRect.left, width: elRect.width });
  }, [activeTab, tags]);

  const refresh = useCallback(async () => {
    try {
      const [postsRes, tagsRes] = await Promise.all([
        fetch("/api/posts", { cache: "no-store" }).then((r) =>
          r.ok ? r.json() : [],
        ),
        fetch("/api/tags", { cache: "no-store" }).then((r) =>
          r.ok ? r.json() : [],
        ),
      ]);
      if (!Array.isArray(postsRes) || !Array.isArray(tagsRes)) return;

      const tagMap = Object.fromEntries(
        tagsRes.map((t: TagWithPostCount) => [t.id, t]),
      );
      const enriched: PostWithTags[] = postsRes.map(
        (post: PostWithTags & { tagIds?: string[] }) => ({
          ...post,
          tags: post.tags?.length
            ? post.tags
            : (post.tagIds ?? []).flatMap((id: string) =>
                tagMap[id] ? [tagMap[id]] : [],
              ),
        }),
      );
      setPosts(enriched);
      setTags(tagsRes);
    } catch {
      // Network error — keep existing state
    }
  }, []);

  // Initial load
  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const closeAllForms = () => {
    setShowPostForm(false);
    setEditingPost(null);
    setShowTagForm(false);
    setEditingTag(null);
    setShowTagManager(false);
  };

  const filteredPosts = posts.filter((post) => {
    const matchesSearch =
      post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (post.content &&
        post.content.toLowerCase().includes(searchQuery.toLowerCase())) ||
      post.slug.toLowerCase().includes(searchQuery.toLowerCase());

    if (activeTab === "all") return matchesSearch;
    return matchesSearch && post.tags.some((t) => t.id === activeTab);
  });

  const activeTagObj = tags.find((t) => t.id === activeTab) ?? null;
  const tagHasPosts = activeTab === "all"
    ? posts.length > 0
    : posts.some((post) => post.tags.some((t) => t.id === activeTab));

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-32 flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-2 border-steel/20 border-t-steel rounded-full animate-spin mb-4" />
        <p className="text-xs font-mono text-muted-foreground/60 tracking-wider">
          RETRIEVING FROM DATABASE...
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-[90rem] mx-auto px-6 pb-16 relative">
      {/* Background Decorative Glow */}
      <div className="absolute top-0 right-10 w-72 h-72 bg-steel/5 blur-3xl rounded-full -z-10" />

      {/* ------------------------------------------------------------------ */}
      {/* Header                                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-12">
        <div className="flex-shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="h-1.5 w-1.5 rounded-full bg-steel animate-pulse" />
            <p className="text-xs font-mono text-muted-foreground tracking-widest uppercase">
              {new Date().getFullYear()} · {posts.length} entries total
            </p>
          </div>
          <h1 className="text-4xl font-display font-bold tracking-tight text-foreground sm:text-5xl">
            Thoughts &{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-steel to-steel-light">
              Notes
            </span>
          </h1>
        </div>

        {/* Right side: Search and Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 lg:flex-1 lg:justify-end max-w-3xl w-full lg:w-auto">
          {/* Search box positioned directly to the right of title */}
          {activeTab === "all" && (
            <div className="relative group w-full max-w-[400px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50 group-focus-within:text-steel transition-colors" />
              <input
                type="text"
                placeholder="Search notes, tags..."
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-muted/20 hover:bg-muted/30 focus:bg-muted/40 border border-border/30 focus:border-steel/40 focus:ring-4 focus:ring-steel/5 rounded-2xl text-sm transition-all focus:outline-none placeholder:text-muted-foreground/40"
              />
            </div>
          )}

          <div className="flex items-center gap-2 shrink-0">
            <motion.button
              onClick={() => {
                closeAllForms();
                setShowTagManager(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-secondary text-secondary-foreground hover:bg-secondary/80 text-xs font-semibold rounded-xl transition-all border border-border/40 cursor-pointer"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
            >
              <Folder className="w-3.5 h-3.5" />
              Manage Tags
            </motion.button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Search & Tags bar                                                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="mb-10">
        {/* Tab bar — navbar style */}
        <div className="border-b border-border/30">
          <div
            ref={tabBarRef}
            className="flex items-center gap-2 relative overflow-x-auto pb-px scrollbar-none"
          >
            {/* All tab */}
            <button
              ref={(el) => {
                if (el) tabRefs.current.set("all", el);
              }}
              onClick={() => switchTab("all")}
              className={cn(
                "relative px-4 py-3 text-sm font-medium transition-all shrink-0 rounded-t-xl cursor-pointer",
                activeTab === "all"
                  ? "text-steel"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              All Notes
              <span className="ml-2 text-xs font-mono px-1.5 py-0.5 bg-muted rounded-md text-muted-foreground/80">
                {posts.length}
              </span>
            </button>

            {/* Tag tabs */}
            {tags.map((tag) => (
              <button
                key={tag.id}
                ref={(el) => {
                  if (el) tabRefs.current.set(tag.id, el);
                }}
                onClick={() => switchTab(tag.id)}
                className={cn(
                  "relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all shrink-0 rounded-t-xl cursor-pointer",
                  activeTab === tag.id
                    ? "text-steel font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: tag.color }}
                />
                {tag.name}
                <span className="text-xs font-mono px-1.5 py-0.5 bg-muted rounded-md text-muted-foreground/80">
                  {tag.postCount}
                </span>
              </button>
            ))}

            {/* Sliding indicator */}
            {indicator && (
              <motion.span
                className="absolute bottom-0 h-0.5 bg-steel"
                layoutId="activeTabIndicator"
                animate={{
                  left: indicator.left,
                  width: indicator.width,
                }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Modals                                                             */}
      {/* ------------------------------------------------------------------ */}
      <AnimatePresence>
        {(showPostForm || editingPost) && (
          <Modal onClose={closeAllForms}>
            <PostForm
              post={editingPost}
              tags={tags}
              preselectedTagId={activeTab !== "all" ? activeTab : undefined}
              saving={saving}
              setSaving={setSaving}
              onSaved={(savedPost) => {
                closeAllForms();
                const tagMap = Object.fromEntries(tags.map((t) => [t.id, t]));
                const enriched: PostWithTags = {
                  ...savedPost,
                  tags: (
                    savedPost.tagIds ??
                    savedPost.tags?.map((t) => t.id) ??
                    []
                  ).flatMap((id: string) => (tagMap[id] ? [tagMap[id]] : [])),
                };
                if (editingPost) {
                  setPosts((prev) =>
                    prev.map((p) => (p.id === enriched.id ? enriched : p)),
                  );
                } else {
                  setPosts((prev) => [enriched, ...prev]);
                }
              }}
              onCancel={closeAllForms}
            />
          </Modal>
        )}
        {(showTagForm || editingTag) && (
          <Modal onClose={closeAllForms}>
            <TagForm
              tag={editingTag}
              existingColors={tags.map((t) => t.color)}
              saving={saving}
              setSaving={setSaving}
              onSaved={(savedTag) => {
                closeAllForms();
                if (editingTag) {
                  setTags((prev) =>
                    prev.map((t) =>
                      t.id === savedTag.id
                        ? { ...savedTag, postCount: t.postCount }
                        : t,
                    ),
                  );
                } else {
                  setTags((prev) => [...prev, { ...savedTag, postCount: 0 }]);
                }
              }}
              onCancel={closeAllForms}
            />
          </Modal>
        )}
        {showTagManager && (
          <Modal onClose={closeAllForms}>
            <TagManager
              tags={tags}
              onEditTag={(tag) => {
                closeAllForms();
                setEditingTag(tag);
              }}
              onAddTag={() => {
                closeAllForms();
                setShowTagForm(true);
              }}
              onDeleteTag={async (tag) => {
                if (tag.postCount > 0 || (tag.postIds && tag.postIds.length > 0)) {
                  alert(
                    `Không thể xóa tag "${tag.name}" vì tag này đang có bài viết sử dụng. Vui lòng gỡ tag khỏi các bài viết trước khi xóa tag!`,
                  );
                  return;
                }
                if (
                  !confirm(
                    `Delete tag "${tag.name}"? This won't delete the notes.`,
                  )
                )
                  return;
                const res = await fetch(`/api/tags/${tag.id}`, { method: "DELETE" });
                if (!res.ok) {
                  const errData = await res.json().catch(() => ({}));
                  alert(errData.error || `Failed to delete tag "${tag.name}".`);
                  return;
                }
                if (activeTab === tag.id) setActiveTab("all");
                refresh();
              }}
              onCancel={closeAllForms}
            />
          </Modal>
        )}
      </AnimatePresence>

      {/* -------------------------------------------------------------- */}
      {/* Post list                                                      */}
      {/* -------------------------------------------------------------- */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab + searchQuery}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab !== "all" && activeTagObj && tagHasPosts && (
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-card border border-border/40 rounded-2xl shadow-sm">
              <div className="flex items-center gap-3">
                <span
                  className="w-3.5 h-3.5 rounded-full shrink-0 animate-pulse"
                  style={{ background: activeTagObj.color }}
                />
                <div>
                  <h2 className="text-base font-bold text-foreground tracking-tight">
                    {activeTagObj.name}
                  </h2>
                  <p className="text-[11px] font-mono text-muted-foreground/60">
                    {filteredPosts.length} of {posts.filter((p) => p.tags.some((t) => t.id === activeTab)).length}{" "}
                    {posts.filter((p) => p.tags.some((t) => t.id === activeTab)).length === 1 ? "note" : "notes"} in this tag
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                {/* Tag-specific Search input */}
                <div className="relative group w-full max-w-[400px] sm:w-[400px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 group-focus-within:text-steel transition-colors" />
                  <input
                    type="text"
                    placeholder={`Search in ${activeTagObj.name}...`}
                    value={localSearch}
                    onChange={(e) => setLocalSearch(e.target.value)}
                    className="w-full pl-9 pr-7 py-2 bg-muted/20 hover:bg-muted/30 focus:bg-muted/40 border border-border/20 focus:border-steel/30 focus:ring-2 focus:ring-steel/5 rounded-xl text-xs transition-all focus:outline-none placeholder:text-muted-foreground/45"
                  />
                  {localSearch && (
                    <button
                      onClick={() => setLocalSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <motion.button
                  onClick={() => {
                    closeAllForms();
                    setShowPostForm(true);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-foreground text-background text-xs font-semibold rounded-xl hover:opacity-90 transition-all shadow-sm shadow-foreground/5 cursor-pointer shrink-0"
                  whileHover={{ y: -0.5 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Post
                </motion.button>
              </div>
            </div>
          )}

          {filteredPosts.length === 0 ? (
            <div className="py-24 text-center border border-dashed border-border/60 rounded-3xl bg-muted/5 flex flex-col items-center justify-center p-6">
              <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-4 text-muted-foreground/60">
                <BookOpen className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-foreground mb-1 text-sm">
                No notes found
              </h3>
              <p className="text-muted-foreground/60 text-xs max-w-xs mb-4">
                {activeTab !== "all"
                  ? `There are no posts in tag "${activeTagObj?.name}" matching your search.`
                  : "Start documenting your ideas and resources today."}
              </p>
              {!tagHasPosts && (
                <button
                  onClick={() => {
                    closeAllForms();
                    setShowPostForm(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-foreground text-background text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Post{" "}
                  {activeTab !== "all" ? `for ${activeTagObj?.name}` : "Note"}
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredPosts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onEdit={() => {
                    closeAllForms();
                    setEditingPost(post);
                  }}
                  onDelete={async () => {
                    if (!confirm("Are you sure you want to delete this note?"))
                      return;
                    await fetch(`/api/posts/${post.id}`, { method: "DELETE" });
                    refresh();
                  }}
                />
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal Overlay with Premium Glassmorphism
// ---------------------------------------------------------------------------

function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-background/50 backdrop-blur-md"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      {/* Content */}
      <motion.div
        className="relative w-full max-w-xl bg-card/85 dark:bg-card/90 border border-border/50 rounded-3xl shadow-2xl p-6 md:p-8 backdrop-blur-2xl overflow-hidden"
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 15 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="absolute top-0 right-0 w-24 h-24 bg-steel/10 blur-2xl rounded-full pointer-events-none" />
        {children}
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Premium Post Card
// ---------------------------------------------------------------------------

function PostCard({
  post,
  onEdit,
  onDelete,
}: {
  post: PostWithTags;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const date = new Date(post.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <motion.div
      className="group relative flex flex-col justify-between p-6 bg-card border border-border/40 hover:border-steel/30 rounded-2xl transition-all shadow-sm hover:shadow-md duration-300 h-full"
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          {post.tags.slice(0, 2).map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border"
              style={{
                background: `${tag.color}12`,
                borderColor: `${tag.color}30`,
                color: tag.color,
              }}
            >
              <span
                className="w-1 h-1 rounded-full"
                style={{ background: tag.color }}
              />
              {tag.name}
            </span>
          ))}
          {post.tags.length > 2 && (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border bg-muted/40 border-border/40 text-muted-foreground cursor-help"
              title={post.tags
                .slice(2)
                .map((t) => t.name)
                .join(", ")}
            >
              +{post.tags.length - 2}
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            onClick={onEdit}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all cursor-pointer"
            title="Edit Note"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all cursor-pointer"
            title="Delete Note"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <Link
          href={`/notes/${post.slug || post.id}`}
          className="block group/link cursor-pointer"
        >
          <h3 className="text-lg font-bold text-foreground group-hover/link:text-steel transition-colors tracking-tight line-clamp-1 mb-2">
            {post.title}
          </h3>
          <p className="text-xs text-muted-foreground/70 line-clamp-2 mb-4 leading-relaxed">
            {post.content && post.content.trim() ? post.content : "N/A"}
          </p>
        </Link>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-border/30 text-[11px] font-mono text-muted-foreground/60">
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          <time className="tabular-nums">{date}</time>
        </div>
        <Link
          href={`/notes/${post.slug || post.id}`}
          className="inline-flex items-center gap-1 text-steel hover:text-steel-light font-medium group/btn transition-colors cursor-pointer"
        >
          Read entry
          <ArrowRight className="w-3 h-3 transition-transform group-hover/btn:translate-x-0.5" />
        </Link>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Premium Post Form
// ---------------------------------------------------------------------------

function PostForm({
  post,
  tags,
  preselectedTagId,
  saving,
  setSaving,
  onSaved,
  onCancel,
}: {
  post?: PostWithTags | null;
  tags: TagWithPostCount[];
  preselectedTagId?: string;
  saving: boolean;
  setSaving: (v: boolean) => void;
  onSaved: (post: PostWithTags & { tagIds?: string[] }) => void;
  onCancel: () => void;
}) {
  const initTagIds =
    post?.tags.map((t) => t.id) ?? (preselectedTagId ? [preselectedTagId] : []);
  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [content, setContent] = useState(post?.content ?? "");
  const [published, setPublished] = useState(post?.published ?? true);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(initTagIds);
  const [error, setError] = useState("");

  const autoSlug = (t: string) =>
    t
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const toggleTag = (id: string) =>
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(post ? `/api/posts/${post.id}` : "/api/posts", {
        method: post ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          slug,
          content,
          published,
          tagIds: selectedTagIds,
        }),
      });
      if (!res.ok) {
        setError((await res.json()).error ?? "Failed to save note");
        return;
      }
      const saved = await res.json();
      onSaved(saved);
    } catch {
      setError("A network error occurred. Please check your connection.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between pb-3 border-b border-border/30">
        <div>
          <h2 className="text-lg font-bold text-foreground tracking-tight">
            {post ? "Edit Post Entry" : "Create New Post"}
          </h2>
          <p className="text-xs text-muted-foreground/60">
            Fill in details for your thoughts.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <motion.p
          className="text-xs font-medium text-destructive bg-destructive/5 border border-destructive/15 px-4 py-2.5 rounded-xl"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {error}
        </motion.p>
      )}

      <div className="space-y-4">
        {/* Title */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
            Title
          </label>
          <input
            autoFocus
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!post) setSlug(autoSlug(e.target.value));
            }}
            placeholder="My latest dynamic experiment..."
            className="w-full px-4 py-3 bg-muted/20 border border-border/30 rounded-xl text-sm focus:border-steel/40 focus:ring-4 focus:ring-steel/5 transition-all focus:outline-none placeholder:text-muted-foreground/30"
            required
          />
        </div>

        {/* Slug */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
            Slug URL
          </label>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="my-latest-experiment"
            className="w-full px-4 py-2 bg-muted/20 border border-border/30 rounded-xl text-xs font-mono text-muted-foreground focus:border-steel/40 focus:ring-4 focus:ring-steel/5 transition-all focus:outline-none"
          />
        </div>

        {/* Content */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
            Content Body
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Document your concepts, scripts, or simple reflections here..."
            rows={5}
            className="w-full px-4 py-3 bg-muted/20 border border-border/30 rounded-xl text-sm leading-relaxed focus:border-steel/40 focus:ring-4 focus:ring-steel/5 transition-all focus:outline-none resize-none placeholder:text-muted-foreground/30"
          />
        </div>

        {/* Tags Selection */}
        {tags.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
              Categorize with Tags
            </label>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const sel = selectedTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className={cn(
                      "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all border cursor-pointer",
                      sel
                        ? "bg-steel border-steel text-white shadow-sm"
                        : "bg-muted/30 border-border/40 text-muted-foreground hover:bg-muted/80",
                    )}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: sel ? "white" : tag.color }}
                    />
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-4 border-t border-border/30">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-foreground text-background text-xs font-semibold rounded-xl hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer"
        >
          {saving ? "Saving..." : post ? "Save Changes" : "Create Post"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Premium Tag Form
// ---------------------------------------------------------------------------

function TagForm({
  tag,
  existingColors,
  saving,
  setSaving,
  onSaved,
  onCancel,
}: {
  tag?: TagWithPostCount | null;
  existingColors: string[];
  saving: boolean;
  setSaving: (v: boolean) => void;
  onSaved: (tag: TagWithPostCount) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(tag?.name ?? "");
  const [color, setColor] = useState(
    tag?.color ?? generateContrastColor(existingColors),
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(tag ? `/api/tags/${tag.id}` : "/api/tags", {
        method: tag ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), color }),
      });
      const saved = await res.json();
      onSaved(saved);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between pb-3 border-b border-border/30">
        <div>
          <h2 className="text-lg font-bold text-foreground tracking-tight">
            {tag ? "Edit Tag Group" : "Create New Tag"}
          </h2>
          <p className="text-xs text-muted-foreground/60">
            Organize your notes into clean collections.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-5">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
            Tag Label Name
          </label>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. System Design, UI/UX..."
            className="w-full px-4 py-3 bg-muted/20 border border-border/30 rounded-xl text-sm focus:border-steel/40 focus:ring-4 focus:ring-steel/5 transition-all focus:outline-none placeholder:text-muted-foreground/30"
            required
          />
        </div>

        {/* Color picker section */}
        <div className="space-y-2.5">
          <label className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
            Visual Palette Accent
          </label>
          <div className="flex items-center gap-3">
            {/* Presets */}
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn(
                      "w-7 h-7 rounded-full transition-all border border-black/5 dark:border-white/5 cursor-pointer",
                      color === c
                        ? "ring-2 ring-offset-2 ring-offset-background ring-steel scale-110"
                        : "hover:scale-105",
                    )}
                    style={{ background: c }}
                  />
                ))}
            </div>
            {/* Native color picker */}
            <label className="relative cursor-pointer shrink-0">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <span
                className={cn(
                  "block w-7 h-7 rounded-full border-2 border-dashed border-border hover:border-steel/60 transition-all flex items-center justify-center text-muted-foreground",
                  !PRESET_COLORS.includes(color)
                    ? "ring-2 ring-offset-2 ring-offset-background ring-steel"
                    : "",
                )}
                style={{ background: color }}
                title="Custom accent"
              >
                {!PRESET_COLORS.includes(color) && (
                  <Check className="w-3.5 h-3.5 text-white mix-blend-difference" />
                )}
              </span>
            </label>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-4 border-t border-border/30">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="px-5 py-2.5 bg-foreground text-background text-xs font-semibold rounded-xl hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer"
        >
          {saving ? "Saving..." : tag ? "Save Changes" : "Create Tag"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// HSL Color Contrast Generator
// ---------------------------------------------------------------------------

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h / 360 + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, h / 360) * 255);
  const b = Math.round(hue2rgb(p, q, h / 360 - 1 / 3) * 255);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

function generateContrastColor(existingHexColors: string[]): string {
  if (existingHexColors.length === 0) {
    const h = Math.random() * 360;
    return hslToHex(h, 0.65, 0.55);
  }

  const existingHues = existingHexColors.map((c) => {
    try {
      return hexToHsl(c)[0];
    } catch {
      return 0;
    }
  });

  let bestHue = 0;
  let bestMinDist = 0;

  for (let candidate = 0; candidate < 360; candidate += 5) {
    const minDist = Math.min(
      ...existingHues.map((h) => {
        const diff = Math.abs(candidate - h);
        return Math.min(diff, 360 - diff);
      }),
    );
    if (minDist > bestMinDist) {
      bestMinDist = minDist;
      bestHue = candidate;
    }
  }

  const jitter = (Math.random() - 0.5) * 20;
  const finalHue = (bestHue + jitter + 360) % 360;

  return hslToHex(
    finalHue,
    0.6 + Math.random() * 0.15,
    0.5 + Math.random() * 0.1,
  );
}

// ---------------------------------------------------------------------------
// Premium Tag Manager Modal Content
// ---------------------------------------------------------------------------

function TagManager({
  tags,
  onEditTag,
  onAddTag,
  onDeleteTag,
  onCancel,
}: {
  tags: TagWithPostCount[];
  onEditTag: (tag: TagWithPostCount) => void;
  onAddTag: () => void;
  onDeleteTag: (tag: TagWithPostCount) => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-3 border-b border-border/30">
        <div>
          <h2 className="text-lg font-bold text-foreground tracking-tight">
            Manage Tag Groups
          </h2>
          <p className="text-xs text-muted-foreground/60">
            Create, update, or remove your classification tags.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1 scrollbar-thin">
        {tags.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No tags created yet.
          </div>
        ) : (
          tags.map((tag) => (
            <div
              key={tag.id}
              className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/10 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 animate-pulse"
                  style={{ background: tag.color }}
                />
                <span className="text-sm font-medium text-foreground">
                  {tag.name}
                </span>
                <span className="text-[11px] font-mono px-1.5 py-0.5 bg-muted rounded-md text-muted-foreground/80">
                  {tag.postCount} {tag.postCount === 1 ? "note" : "notes"}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onEditTag(tag)}
                  className="p-1.5 text-muted-foreground hover:text-steel hover:bg-muted rounded-lg transition-colors cursor-pointer"
                  title="Edit tag"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDeleteTag(tag)}
                  className={cn(
                    "p-1.5 rounded-lg transition-colors",
                    tag.postCount > 0
                      ? "text-muted-foreground/30 hover:bg-muted cursor-not-allowed"
                      : "text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                  )}
                  title={tag.postCount > 0 ? "Cannot delete tag containing posts" : "Delete tag"}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-border/30">
        <button
          type="button"
          onClick={onAddTag}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-steel text-white text-xs font-semibold rounded-xl hover:bg-steel/90 transition-colors shadow-sm cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Tag
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          Close
        </button>
      </div>
    </div>
  );
}
