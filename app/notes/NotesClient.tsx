"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  X,
  Pencil,
  Trash2,
  Search,
  BookOpen,
  Folder,
  Calendar,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import type { PostWithTags, TagWithPostCount } from "@/lib/notion-types";

/** Generate a URL-friendly slug from a tag name */
function tagSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

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
  const { toast } = useToast();
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

  // Active tab: "all" | tag.id — synced with ?tab=<tag-slug> param
  const [activeTab, setActiveTab] = useState<string>("all");
  const initialTabParam = searchParams.get("tab");

  // Resolve ?tab=slug → tag.id once tags are loaded
  useEffect(() => {
    if (!initialTabParam || tags.length === 0) return;
    if (initialTabParam === "all") return;
    const matched = tags.find((t) => tagSlug(t.name) === initialTabParam);
    if (matched) {
      setActiveTab(matched.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tags]);

  const switchTab = useCallback(
    (tabId: string) => {
      setActiveTab(tabId);
      setLocalSearch("");
      const params = new URLSearchParams(window.location.search);
      if (tabId === "all") {
        params.delete("tab");
      } else {
        const tag = tags.find((t) => t.id === tabId);
        params.set("tab", tag ? tagSlug(tag.name) : tabId);
      }
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `/notes?${qs}` : "/notes");
    },
    [tags],
  );

  // Form states
  const [showPostForm, setShowPostForm] = useState(false);
  const [editingPost, setEditingPost] = useState<PostWithTags | null>(null);
  const [viewingPost, setViewingPost] = useState<PostWithTags | null>(null);
  const [showTagForm, setShowTagForm] = useState(false);
  const [editingTag, setEditingTag] = useState<TagWithPostCount | null>(null);
  const [showTagManager, setShowTagManager] = useState(false);

  // Tab bar reference for auto-scrolling
  const tabBarRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = useCallback(() => {
    if (tabBarRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = tabBarRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  }, []);

  useEffect(() => {
    checkScroll();
    window.addEventListener("resize", checkScroll);
    return () => window.removeEventListener("resize", checkScroll);
  }, [checkScroll, tags]);

  useEffect(() => {
    const bar = tabBarRef.current;
    if (!bar) return;
    const activeEl = bar.querySelector('[data-active="true"]');
    if (activeEl) {
      activeEl.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [activeTab]);

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
    setViewingPost(null);
    setShowTagForm(false);
    setEditingTag(null);
    setShowTagManager(false);
  };

  const handleBackup = async () => {
    try {
      const res = await fetch("/api/backup-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posts, tags }),
      });
      const data = await res.json();
      if (res.ok) {
        toast(`Backup #${data.index} saved → ${data.path}`);
      } else {
        toast(data.error || "Failed to save backup", "error");
      }
    } catch {
      toast("Error saving backup", "error");
    }
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
  const tagHasPosts =
    activeTab === "all"
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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-4 lg:mb-12">
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
          <div className="flex items-center gap-2 shrink-0 border-t border-border/10 pt-4 sm:border-t-0 sm:pt-0 w-full sm:w-auto justify-start">
            <motion.button
              onClick={handleBackup}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-secondary text-secondary-foreground hover:bg-secondary/80 text-xs font-semibold rounded-xl transition-all border border-border/30 cursor-pointer shadow-sm shadow-foreground/5"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
            >
              <Download className="w-3.5 h-3.5" />
              Save md file
            </motion.button>
            <motion.button
              onClick={() => {
                closeAllForms();
                setShowTagManager(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-secondary text-secondary-foreground hover:bg-secondary/80 text-xs font-semibold rounded-xl transition-all border border-border/30 cursor-pointer shadow-sm shadow-foreground/5"
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
      <div className="lg:mb-10 mb-4 relative group">
        <div
          ref={tabBarRef}
          onScroll={checkScroll}
          className="flex items-center gap-2 overflow-x-auto pb-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] scroll-smooth"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {/* All tab */}
          <button
            data-active={activeTab === "all"}
            onClick={() => switchTab("all")}
            className={cn(
              "relative px-4 py-2.5 text-sm font-medium transition-colors shrink-0 rounded-full cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-foreground/50 border flex items-center gap-2",
              activeTab === "all"
                ? "text-background border-transparent"
                : "bg-card hover:bg-muted/50 text-muted-foreground hover:text-foreground border-border/40",
            )}
          >
            {activeTab === "all" && (
              <motion.div
                className="absolute inset-0 rounded-full bg-foreground shadow-sm shadow-foreground/20"
                layoutId="activeTabBackground"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative z-10">All Notes</span>
            <span
              className={cn(
                "relative z-10 text-xs font-mono px-1.5 py-0.5 rounded-md transition-colors",
                activeTab === "all"
                  ? "bg-background/20 text-background"
                  : "bg-muted text-muted-foreground/80",
              )}
            >
              {posts.length}
            </span>
          </button>

          {/* Tag tabs */}
          {tags.map((tag) => (
            <button
              key={tag.id}
              data-active={activeTab === tag.id}
              onClick={() => switchTab(tag.id)}
              className={cn(
                "relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors shrink-0 rounded-full cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-foreground/50 border",
                activeTab === tag.id
                  ? "text-background border-transparent"
                  : "bg-card hover:bg-muted/50 text-muted-foreground hover:text-foreground border-border/40",
              )}
            >
              {activeTab === tag.id && (
                <motion.div
                  className="absolute inset-0 rounded-full bg-foreground shadow-sm shadow-foreground/20"
                  layoutId="activeTabBackground"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <span
                className="relative z-10 w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: tag.color }}
              />
              <span className="relative z-10">{tag.name}</span>
              <span
                className={cn(
                  "relative z-10 text-xs font-mono px-1.5 py-0.5 rounded-md transition-colors",
                  activeTab === tag.id
                    ? "bg-background/20 text-background"
                    : "bg-muted text-muted-foreground/80",
                )}
              >
                {tag.postCount}
              </span>
            </button>
          ))}
        </div>

        {/* Scroll fade masks and chevron buttons */}
        <AnimatePresence>
          {canScrollLeft && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute top-0 left-0 bottom-4 w-20 bg-gradient-to-r from-background via-background/80 to-transparent flex items-center justify-start pointer-events-none z-20"
            >
              <button
                onClick={() =>
                  tabBarRef.current?.scrollBy({
                    left: -250,
                    behavior: "smooth",
                  })
                }
                className="w-8 h-8 flex items-center justify-center bg-background border border-border shadow-sm rounded-full pointer-events-auto text-muted-foreground hover:text-foreground transition-all hover:scale-105 active:scale-95 shadow-foreground/5 ml-1"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {canScrollRight && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute top-0 right-0 bottom-4 w-20 bg-gradient-to-l from-background via-background/80 to-transparent flex items-center justify-end pointer-events-none z-20"
            >
              <button
                onClick={() =>
                  tabBarRef.current?.scrollBy({ left: 250, behavior: "smooth" })
                }
                className="w-8 h-8 flex items-center justify-center bg-background border border-border shadow-sm rounded-full pointer-events-auto text-muted-foreground hover:text-foreground transition-all hover:scale-105 active:scale-95 shadow-foreground/5 mr-1"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
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
                  // Update tag counts: remove from old tags, add to new tags
                  const oldTagIds = editingPost.tags.map((t) => t.id);
                  const newTagIds = enriched.tags.map((t) => t.id);
                  setTags((prev) =>
                    prev.map((t) => {
                      const wasIn = oldTagIds.includes(t.id);
                      const isIn = newTagIds.includes(t.id);
                      if (wasIn && !isIn)
                        return {
                          ...t,
                          postCount: Math.max(0, t.postCount - 1),
                        };
                      if (!wasIn && isIn)
                        return { ...t, postCount: t.postCount + 1 };
                      return t;
                    }),
                  );
                  toast("Post updated successfully");
                } else {
                  setPosts((prev) => [enriched, ...prev]);
                  // Increment tag counts for new post
                  const newTagIds = enriched.tags.map((t) => t.id);
                  setTags((prev) =>
                    prev.map((t) =>
                      newTagIds.includes(t.id)
                        ? { ...t, postCount: t.postCount + 1 }
                        : t,
                    ),
                  );
                  toast("Post created successfully");
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
                setShowTagForm(false);
                setEditingTag(null);
                setShowTagManager(true);
                if (editingTag) {
                  setTags((prev) =>
                    prev.map((t) =>
                      t.id === savedTag.id
                        ? { ...savedTag, postCount: t.postCount }
                        : t,
                    ),
                  );
                  toast("Tag updated successfully");
                } else {
                  setTags((prev) => [...prev, { ...savedTag, postCount: 0 }]);
                  toast("Tag created successfully");
                }
              }}
              onCancel={() => {
                setShowTagForm(false);
                setEditingTag(null);
                setShowTagManager(true);
              }}
            />
          </Modal>
        )}
        {showTagManager && (
          <Modal onClose={closeAllForms}>
            <TagManager
              tags={tags}
              onEditTag={(tag) => {
                setShowTagManager(false);
                setEditingTag(tag);
              }}
              onAddTag={() => {
                setShowTagManager(false);
                setShowTagForm(true);
              }}
              onDeleteTag={async (tag) => {
                if (
                  tag.postCount > 0 ||
                  (tag.postIds && tag.postIds.length > 0)
                ) {
                  toast(
                    `Cannot delete tag "${tag.name}" — it has posts`,
                    "error",
                  );
                  return;
                }
                if (
                  !confirm(
                    `Delete tag "${tag.name}"? This won't delete the notes.`,
                  )
                )
                  return;
                const res = await fetch(`/api/tags/${tag.id}`, {
                  method: "DELETE",
                });
                if (!res.ok) {
                  const errData = await res.json().catch(() => ({}));
                  toast(
                    errData.error || `Failed to delete tag "${tag.name}"`,
                    "error",
                  );
                  return;
                }
                if (activeTab === tag.id) setActiveTab("all");
                setTags((prev) => prev.filter((t) => t.id !== tag.id));
                toast(`Tag "${tag.name}" deleted`);
              }}
              onCancel={closeAllForms}
            />
          </Modal>
        )}
        {viewingPost && (
          <Modal onClose={closeAllForms}>
            <PostDetailView
              post={viewingPost}
              onEdit={() => {
                const post = viewingPost;
                closeAllForms();
                setEditingPost(post);
              }}
              onClose={closeAllForms}
            />
          </Modal>
        )}
      </AnimatePresence>

      {/* -------------------------------------------------------------- */}
      {/* Search & Actions Detail Bar                                    */}
      {/* -------------------------------------------------------------- */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Mobile Top Row / Desktop Left Side */}
        <div className="flex items-center justify-between w-full sm:w-auto">
          <div className="flex items-center gap-3">
            {activeTab === "all" ? (
              <BookOpen className="w-4 h-4 text-steel shrink-0" />
            ) : (
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ background: activeTagObj?.color }}
              />
            )}
            <p className="text-xs font-mono text-muted-foreground/70">
              {activeTab === "all"
                ? `${posts.length} ${posts.length === 1 ? "note" : "notes"} in total`
                : `${posts.filter((p) => p.tags.some((t) => t.id === activeTab)).length} ${posts.filter((p) => p.tags.some((t) => t.id === activeTab)).length === 1 ? "note" : "notes"} in this tag`}
            </p>
          </div>

          {/* Post button for mobile (shown on left row's right side) */}
          {activeTab !== "all" && (
            <motion.button
              onClick={() => {
                closeAllForms();
                setShowPostForm(true);
              }}
              className="sm:hidden inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-foreground text-background text-xs font-semibold rounded-xl hover:opacity-90 transition-all border border-foreground/10 shadow-sm shadow-foreground/5 cursor-pointer shrink-0"
              whileHover={{ y: -0.5 }}
              whileTap={{ scale: 0.98 }}
            >
              <Plus className="w-3.5 h-3.5" />
              Post
            </motion.button>
          )}
        </div>

        {/* Mobile Bottom Row / Desktop Right Side */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative group w-full sm:w-64 lg:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 group-focus-within:text-steel transition-colors" />
            <input
              type="text"
              placeholder={
                activeTab === "all"
                  ? "Search all notes..."
                  : `Search in ${activeTagObj?.name}...`
              }
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="w-full pl-9 pr-7 py-2.5 bg-muted/20 hover:bg-muted/30 focus:bg-muted/40 border border-border/30 focus:border-steel/30 focus:ring-2 focus:ring-steel/5 rounded-xl text-xs transition-all focus:outline-none placeholder:text-muted-foreground/45 shadow-sm"
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

          {/* Post button for desktop (shown next to search) */}
          {activeTab !== "all" && (
            <motion.button
              onClick={() => {
                closeAllForms();
                setShowPostForm(true);
              }}
              className="hidden sm:inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-foreground text-background text-xs font-semibold rounded-xl hover:opacity-90 transition-all border border-foreground/10 shadow-sm shadow-foreground/5 cursor-pointer shrink-0"
              whileHover={{ y: -0.5 }}
              whileTap={{ scale: 0.98 }}
            >
              <Plus className="w-3.5 h-3.5" />
              Post
            </motion.button>
          )}
        </div>
      </div>

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
          {filteredPosts.length === 0 ? (
            <div className="py-10 lg:py-24 text-center border border-dashed border-border/60 rounded-3xl bg-muted/5 flex flex-col items-center justify-center p-6">
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
              {!tagHasPosts && activeTab !== "all" && (
                <button
                  onClick={() => {
                    closeAllForms();
                    setShowPostForm(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-foreground text-background text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity border border-foreground/10 cursor-pointer shadow-sm shadow-foreground/5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Post for {activeTagObj?.name}
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {filteredPosts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onView={() => {
                    closeAllForms();
                    setViewingPost(post);
                  }}
                  onEdit={() => {
                    closeAllForms();
                    setEditingPost(post);
                  }}
                  onDelete={async () => {
                    if (!confirm("Are you sure you want to delete this note?"))
                      return;
                    const res = await fetch(`/api/posts/${post.id}`, {
                      method: "DELETE",
                    });
                    if (!res.ok) {
                      toast("Failed to delete post", "error");
                      return;
                    }
                    // Decrement tag counts for deleted post
                    const deletedTagIds = post.tags.map((t) => t.id);
                    setTags((prev) =>
                      prev.map((t) =>
                        deletedTagIds.includes(t.id)
                          ? { ...t, postCount: Math.max(0, t.postCount - 1) }
                          : t,
                      ),
                    );
                    setPosts((prev) => prev.filter((p) => p.id !== post.id));
                    toast("Post deleted successfully");
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
  onView,
}: {
  post: PostWithTags;
  onEdit: () => void;
  onDelete: () => void;
  onView: () => void;
}) {
  const date = new Date(post.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <motion.div
      className="group relative flex flex-col justify-between p-4 bg-card border border-border/30 hover:border-steel/30 rounded-2xl transition-all shadow-sm hover:shadow-md duration-300 h-full"
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      layout
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {post.tags.slice(0, 2).map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border"
              style={{
                background: `${tag.color}12`,
                borderColor: `${tag.color}30`,
                color: tag.color,
              }}
            >
              <span
                className="w-1 h-1 rounded-full animate-pulse"
                style={{ background: tag.color }}
              />
              {tag.name}
            </span>
          ))}
          {post.tags.length > 2 && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-mono font-semibold border bg-muted/40 border-border/40 text-muted-foreground cursor-help"
              title={post.tags
                .slice(2)
                .map((t) => t.name)
                .join(", ")}
            >
              +{post.tags.length - 2}
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            onClick={onEdit}
            className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-all cursor-pointer"
            title="Edit Note"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-all cursor-pointer"
            title="Delete Note"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <button
          onClick={onView}
          className="block group/link cursor-pointer text-left w-full"
        >
          <h3 className="text-base font-bold text-foreground group-hover/link:text-steel transition-colors tracking-tight line-clamp-1 mb-1">
            {post.title}
          </h3>
          <p className="text-[11px] text-muted-foreground/70 line-clamp-2 mb-3 leading-relaxed">
            {post.content && post.content.trim() ? post.content : "N/A"}
          </p>
        </button>
      </div>

      <div className="flex items-center justify-between pt-2.5 border-t border-border/30 text-[10px] font-mono text-muted-foreground/60">
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          <time className="tabular-nums">{date}</time>
        </div>
        <button
          onClick={onView}
          className="inline-flex items-center gap-1 text-steel hover:text-steel-light font-medium group/btn transition-colors cursor-pointer"
        >
          Read entry
          <ArrowRight className="w-3 h-3 transition-transform group-hover/btn:translate-x-0.5" />
        </button>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Post Detail View (read-only modal)
// ---------------------------------------------------------------------------

function PostDetailView({
  post,
  onEdit,
  onClose,
}: {
  post: PostWithTags;
  onEdit: () => void;
  onClose: () => void;
}) {
  const date = new Date(post.createdAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {post.tags.map((tag) => (
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
          </div>
          <h2 className="text-xl font-bold text-foreground tracking-tight leading-tight">
            {post.title}
          </h2>
          <p className="text-xs font-mono text-muted-foreground/60 mt-1.5">
            {date}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="p-2 text-muted-foreground hover:text-steel hover:bg-muted rounded-lg transition-all cursor-pointer"
            title="Edit"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="border-t border-border/30 pt-5">
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
            {post.content && post.content.trim() ? post.content : "No content."}
          </p>
        </div>
      </div>

      {post.slug && (
        <div className="pt-3 border-t border-border/20">
          <p className="text-[11px] font-mono text-muted-foreground/50">
            slug: {post.slug}
          </p>
        </div>
      )}
    </div>
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
                      : "text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer",
                  )}
                  title={
                    tag.postCount > 0
                      ? "Cannot delete tag containing posts"
                      : "Delete tag"
                  }
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
