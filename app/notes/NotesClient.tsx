"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PostWithTags, TagWithPostCount } from "@/lib/notion-types";

const PRESET_COLORS = [
  "#6b9ac4", "#8bb5d9", "#10b981",
  "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#64748b",
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function NotesClient() {
  const searchParams = useSearchParams();
  const [posts, setPosts] = useState<PostWithTags[]>([]);
  const [tags, setTags] = useState<TagWithPostCount[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Active tab: "all" | tag.id — synced with ?tab= param
  const [activeTab, setActiveTab] = useState<string>(
    searchParams.get("tab") ?? "all"
  );

  const switchTab = useCallback((tabId: string) => {
    setActiveTab(tabId);
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

  // Sliding indicator (navbar pattern)
  const tabBarRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const bar = tabBarRef.current;
    if (!bar) return;
    const el = tabRefs.current.get(activeTab);
    if (!el) { setIndicator(null); return; }
    const barRect = bar.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    setIndicator({ left: elRect.left - barRect.left + 8, width: elRect.width - 16 });
  }, [activeTab, tags]);

  const refresh = useCallback(async () => {
    const [postsRes, tagsRes]: [PostWithTags[], TagWithPostCount[]] = await Promise.all([
      fetch("/api/posts", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/tags", { cache: "no-store" }).then((r) => r.json()),
    ]);
    const tagMap = Object.fromEntries(tagsRes.map((t) => [t.id, t]));
    const enriched: PostWithTags[] = postsRes.map((post) => ({
      ...post,
      tags: post.tags?.length
        ? post.tags
        : ((post as unknown as { tagIds?: string[] }).tagIds ?? []).flatMap(
            (id) => (tagMap[id] ? [tagMap[id]] : [])
          ),
    }));
    setPosts(enriched);
    setTags(tagsRes);
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
  };

  const visiblePosts = activeTab === "all"
    ? posts
    : posts.filter((p) => p.tags.some((t) => t.id === activeTab));

  const activeTagObj = tags.find((t) => t.id === activeTab) ?? null;

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-24 text-center">
        <p className="text-sm font-mono text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">

      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-start justify-between mb-10">
        <div>
          <p className="text-xs font-mono text-muted-foreground tracking-widest uppercase mb-2">
            {new Date().getFullYear()} · {posts.length} entries
          </p>
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">
            Notes
          </h1>
        </div>

        <div className="flex items-center gap-2 mt-1">
          <motion.button
            onClick={() => { closeAllForms(); setShowTagForm(true); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-muted text-muted-foreground text-xs font-medium rounded-lg hover:text-foreground transition-colors"
            whileTap={{ scale: 0.95 }}
          >
            <Plus className="w-3.5 h-3.5" />
            Tag
          </motion.button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Modals                                                                */}
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
                  tags: (savedPost.tagIds ?? savedPost.tags?.map((t) => t.id) ?? [])
                    .flatMap((id: string) => (tagMap[id] ? [tagMap[id]] : [])),
                };
                if (editingPost) {
                  setPosts((prev) => prev.map((p) => p.id === enriched.id ? enriched : p));
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
              saving={saving}
              setSaving={setSaving}
              onSaved={(savedTag) => {
                closeAllForms();
                if (editingTag) {
                  setTags((prev) => prev.map((t) => t.id === savedTag.id
                    ? { ...savedTag, postCount: t.postCount }
                    : t
                  ));
                } else {
                  setTags((prev) => [...prev, { ...savedTag, postCount: 0 }]);
                }
              }}
              onCancel={closeAllForms}
            />
          </Modal>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------------ */}
      {/* Tab bar — navbar style                                               */}
      {/* ------------------------------------------------------------------ */}
      <div
        ref={tabBarRef}
        className="flex items-center gap-1 relative border-b border-border/40 mb-8 overflow-x-auto"
      >
            {/* All tab */}
            <button
              ref={(el) => { if (el) tabRefs.current.set("all", el); }}
              onClick={() => switchTab("all")}
              className={cn(
                "relative px-4 py-2.5 text-sm transition-colors duration-200 rounded-t-lg shrink-0",
                activeTab === "all"
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              )}
            >
              All
              <span className="ml-1.5 text-xs font-mono opacity-40">{posts.length}</span>
            </button>

            {/* Tag tabs */}
            {tags.map((tag) => (
              <div key={tag.id} className="group/tabtag relative shrink-0">
                <button
                  ref={(el) => { if (el) tabRefs.current.set(tag.id, el); }}
                  onClick={() => switchTab(tag.id)}
                  className={cn(
                    "relative flex items-center gap-1.5 px-4 py-2.5 text-sm transition-colors duration-200 rounded-t-lg",
                    activeTab === tag.id
                      ? "text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  )}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: tag.color }}
                  />
                  {tag.name}
                  <span className="text-xs font-mono opacity-40">{tag.postCount}</span>
                </button>

                {/* Hover actions */}
                <span className="absolute -top-1 right-0 hidden group-hover/tabtag:flex items-center gap-0.5 bg-background border border-border/60 rounded-full px-1 py-0.5 shadow-sm z-20">
                  <button
                    onClick={(e) => { e.stopPropagation(); closeAllForms(); setShowPostForm(true); setActiveTab(tag.id); }}
                    className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                    title="Add post"
                  >
                    <Plus className="w-2.5 h-2.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); closeAllForms(); setEditingTag(tag); }}
                    className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                    title="Edit tag"
                  >
                    <Pencil className="w-2.5 h-2.5" />
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm(`Delete tag "${tag.name}"?`)) return;
                      await fetch(`/api/tags/${tag.id}`, { method: "DELETE" });
                      if (activeTab === tag.id) setActiveTab("all");
                      refresh();
                    }}
                    className="p-0.5 text-muted-foreground hover:text-destructive transition-colors"
                    title="Delete tag"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </span>
              </div>
            ))}

            {/* + Tag button in tab bar */}
            <button
              onClick={() => { closeAllForms(); setShowTagForm(true); }}
              className="shrink-0 px-3 py-2.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
              title="New tag"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>

            {/* Sliding indicator — navbar style */}
            <motion.span
              className="absolute bottom-0 h-0.5 rounded-full bg-gradient-to-r from-steel to-steel-light pointer-events-none"
              animate={{
                opacity: indicator ? 1 : 0,
                left: indicator?.left ?? 0,
                width: indicator?.width ?? 0,
              }}
              transition={{
                left: { type: "spring", stiffness: 400, damping: 32 },
                width: { type: "spring", stiffness: 400, damping: 32 },
                opacity: { duration: 0.15 },
              }}
            />
          </div>

          {/* -------------------------------------------------------------- */}
          {/* + Post button for active tag (not All)                           */}
          {/* -------------------------------------------------------------- */}
          {activeTab !== "all" && (
            <div className="flex items-center justify-between mb-5">
              <p className="text-xs text-muted-foreground">
                {visiblePosts.length} {visiblePosts.length === 1 ? "post" : "posts"} in{" "}
                <span className="font-medium text-foreground">{activeTagObj?.name}</span>
              </p>
              <motion.button
                onClick={() => { closeAllForms(); setShowPostForm(true); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-foreground text-background text-xs font-medium rounded-lg hover:opacity-80 transition-opacity"
                whileTap={{ scale: 0.95 }}
              >
                <Plus className="w-3 h-3" />
                Post
              </motion.button>
            </div>
          )}

          {/* -------------------------------------------------------------- */}
          {/* Post list                                                         */}
          {/* -------------------------------------------------------------- */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              {visiblePosts.length === 0 ? (
                <div className="py-20 text-center border border-dashed border-border/50 rounded-xl">
                  <p className="text-muted-foreground text-sm mb-3">
                    {activeTab !== "all"
                      ? `No posts in "${activeTagObj?.name}" yet.`
                      : "No notes yet."}
                  </p>
                  <button
                    onClick={() => { closeAllForms(); setShowPostForm(true); }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                  >
                    Create one
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {visiblePosts.map((post) => (
                    <PostRow
                      key={post.id}
                      post={post}
                      onEdit={() => { closeAllForms(); setEditingPost(post); }}
                      onDelete={async () => {
                        if (!confirm("Delete this post?")) return;
                        await fetch(`/api/posts/${post.id}`, { method: "DELETE" });
                        refresh();
                      }}
                      onTogglePublish={async () => {
                        await fetch(`/api/posts/${post.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ published: !post.published }),
                        });
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
// Modal overlay
// ---------------------------------------------------------------------------

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-background/60 backdrop-blur-sm"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      {/* Content */}
      <motion.div
        className="relative w-full max-w-lg bg-card border border-border/60 rounded-2xl shadow-xl p-6"
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Post row
// ---------------------------------------------------------------------------

function PostRow({ post, onEdit, onDelete, onTogglePublish }: {
  post: PostWithTags;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePublish: () => void;
}) {
  const date = new Date(post.createdAt).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

  return (
    <motion.div
      className="group flex items-start gap-4 py-4 -mx-3 px-3 rounded-xl hover:bg-muted/20 transition-colors"
      whileHover={{ x: 2 }}
      transition={{ duration: 0.15 }}
    >
      <div className="pt-1.5 shrink-0">
        <span
          className={`block w-1.5 h-1.5 rounded-full ${post.published ? "bg-emerald-500" : "bg-muted-foreground/30"}`}
          title={post.published ? "Published" : "Draft"}
        />
      </div>

      <Link href={`/notes/${post.slug || post.id}`} className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3 mb-0.5">
          <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
            {post.title}
          </span>
          <time className="text-xs font-mono text-muted-foreground shrink-0 tabular-nums">
            {date}
          </time>
        </div>
        {post.content && (
          <p className="text-xs text-muted-foreground line-clamp-1 leading-relaxed mb-1.5">
            {post.content}
          </p>
        )}
        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {post.tags.map((tag) => (
              <span key={tag.id} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: tag.color }} />
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </Link>

      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity pt-0.5">
        <button onClick={onTogglePublish} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md transition-colors" title={post.published ? "Unpublish" : "Publish"}>
          {post.published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
        <button onClick={onEdit} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md transition-colors" title="Edit">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors" title="Delete">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Post form
// ---------------------------------------------------------------------------

function PostForm({ post, tags, preselectedTagId, saving, setSaving, onSaved, onCancel }: {
  post?: PostWithTags | null;
  tags: TagWithPostCount[];
  preselectedTagId?: string;
  saving: boolean;
  setSaving: (v: boolean) => void;
  onSaved: (post: PostWithTags & { tagIds?: string[] }) => void;
  onCancel: () => void;
}) {
  const initTagIds = post?.tags.map((t) => t.id) ?? (preselectedTagId ? [preselectedTagId] : []);
  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [content, setContent] = useState(post?.content ?? "");
  const [published, setPublished] = useState(post?.published ?? false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(initTagIds);
  const [error, setError] = useState("");

  const autoSlug = (t: string) =>
    t.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");

  const toggleTag = (id: string) =>
    setSelectedTagIds((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch(post ? `/api/posts/${post.id}` : "/api/posts", {
        method: post ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, slug, content, published, tagIds: selectedTagIds }),
      });
      if (!res.ok) { setError((await res.json()).error ?? "Failed"); return; }
      const saved = await res.json();
      onSaved(saved);
    } catch { setError("Network error"); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">
          {post ? "Edit post" : "New post"}
        </span>
        <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {error && <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>}

      <input autoFocus type="text" value={title}
        onChange={(e) => { setTitle(e.target.value); if (!post) setSlug(autoSlug(e.target.value)); }}
        placeholder="Title"
        className="w-full px-3 py-2.5 bg-muted/40 border border-border/60 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/40 transition-colors"
        required
      />

      <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug"
        className="w-full px-3 py-2 bg-muted/40 border border-border/60 rounded-lg text-xs font-mono text-muted-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/40 transition-colors"
      />

      <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Content (optional)" rows={5}
        className="w-full px-3 py-2.5 bg-muted/40 border border-border/60 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/40 transition-colors resize-none leading-relaxed"
      />

      {tags.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => {
              const sel = selectedTagIds.includes(tag.id);
              return (
                <button key={tag.id} type="button" onClick={() => toggleTag(tag.id)}
                  className={cn(
                    "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all",
                    sel ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: sel ? "currentColor" : tag.color }} />
                  {tag.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <button type="button" role="switch" aria-checked={published} onClick={() => setPublished(!published)}
            className={cn("relative w-8 h-4 rounded-full transition-colors", published ? "bg-emerald-500" : "bg-muted")}
          >
            <span className={cn("absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-transform", published ? "translate-x-4" : "")} />
          </button>
          <span className="text-xs text-muted-foreground">{published ? "Publish" : "Draft"}</span>
        </label>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
          <button type="submit" disabled={saving}
            className="px-4 py-2 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-80 disabled:opacity-40 transition-opacity"
          >
            {saving ? "Saving..." : post ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Tag form
// ---------------------------------------------------------------------------

function TagForm({ tag, saving, setSaving, onSaved, onCancel }: {
  tag?: TagWithPostCount | null;
  saving: boolean;
  setSaving: (v: boolean) => void;
  onSaved: (tag: TagWithPostCount) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(tag?.name ?? "");
  const [color, setColor] = useState(tag?.color ?? "#6b9ac4");

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
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">
          {tag ? "Edit tag" : "New tag"}
        </span>
        <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center gap-3">
        <input autoFocus type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tag name"
          className="flex-1 px-3 py-2.5 bg-muted/40 border border-border/60 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/40 transition-colors"
          required
        />
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {PRESET_COLORS.map((c) => (
          <button key={c} type="button" onClick={() => setColor(c)}
            className={cn("w-6 h-6 rounded-full transition-transform hover:scale-110", color === c ? "ring-2 ring-offset-2 ring-offset-background ring-foreground/40 scale-110" : "")}
            style={{ background: c }}
          />
        ))}
      </div>
      <div className="flex items-center justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
        <button type="submit" disabled={saving || !name.trim()}
          className="px-4 py-2 bg-foreground text-background text-sm font-medium rounded-lg hover:opacity-80 disabled:opacity-40 transition-opacity"
        >
          {saving ? "Saving..." : tag ? "Save" : "Create"}
        </button>
      </div>
    </form>
  );
}
