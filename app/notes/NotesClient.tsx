"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import * as React from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import confetti from "canvas-confetti";
import {
  DndContext,
  closestCenter,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { ThemeToggle } from "@/components/theme-toggle";
import { ImagePreview } from "@/components/ui/image-preview";
import type { PostWithTags, TagWithPostCount } from "@/lib/notion-types";

const Editor = dynamic(() => import("@/components/ui/editor/Editor"), {
  ssr: false,
  loading: () => (
    <div className="h-[200px] rounded-xl border border-border/30 bg-muted/20 animate-pulse" />
  ),
});

/** Generate a URL-friendly slug from a tag name */
function tagSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Strip HTML tags to get plain text for previews */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\[!(success|info|warning|error)\]\s*/g, "") // Remove callout markers
    .trim();
}

/** Convert plain text to HTML (newlines → paragraphs) if no HTML detected */
function contentToHtml(content: string): string {
  let html: string;
  // If already contains HTML tags, use as-is
  if (/<[a-z][\s\S]*>/i.test(content)) {
    html = content;
  } else {
    // Split by double newlines into paragraphs, single newlines into <br>
    html = content
      .split(/\n\n+/)
      .map((block) => `<p>${block.replace(/\n/g, "<br>")}</p>`)
      .join("");
  }
  
  const copyIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
  
  // Transform callout markers in blockquotes: [!success], [!info], [!warning], [!error]
  html = html.replace(
    /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi,
    (_match, inner: string) => {
      const markerMatch = inner.match(
        /^\s*(?:<[^>]+>)*\s*\[!(success|info|warning|error)\]\s*/,
      );
      if (markerMatch) {
        const type = markerMatch[1];
        const cleanInner = inner.replace(/\[!(success|info|warning|error)\]\s*/, "");
        return `<div class="callout callout-${type}"><button class="callout-copy-btn" data-copy title="Copy">${copyIcon}</button><div class="callout-content">${cleanInner}</div></div>`;
      }
      return `<blockquote>${inner}</blockquote>`;
    },
  );
  
  // Also handle plain text with [!type] markers (not in blockquote)
  html = html.replace(
    /(<p[^>]*>)\s*\[!(success|info|warning|error)\]\s*([\s\S]*?)(<\/p>)/gi,
    (_match, _openTag, type, innerContent) => {
      return `<div class="callout callout-${type}"><button class="callout-copy-btn" data-copy title="Copy">${copyIcon}</button><div class="callout-content">${innerContent}</div></div>`;
    },
  );
  
  return html;
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
  
  // Favorites state (synced with localStorage + API)
  const [favoriteTags, setFavoriteTags] = useState<Set<string>>(new Set());
  
  // Anonymous user ID (generated once per browser, stored in localStorage)
  const [userId, setUserId] = useState<string>("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(localSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch]);

  // View mode: "favorites" | "show-all" (mutually exclusive)
  // Active tag: tag.id | null (independent from view mode)
  const [viewMode, setViewMode] = useState<"favorites" | "show-all">("favorites");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const initialTabParam = searchParams.get("tab");

  // Generate or retrieve anonymous user ID on mount
  useEffect(() => {
    const STORAGE_KEY = "notes-anonymous-user-id";
    let id = localStorage.getItem(STORAGE_KEY);
    
    if (!id) {
      // Generate new UUID v4 for new user
      id = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, id);
      
      console.log("[UserId] Generated new userId:", id);
      
      // Clear old favorites from localStorage (new user = empty favorites)
      localStorage.removeItem("notes-favorite-tags");
      setFavoriteTags(new Set());
    } else {
      console.log("[UserId] Loaded existing userId:", id);
    }
    
    setUserId(id);
  }, []);

  // Load favorites from localStorage on mount + sync with server
  useEffect(() => {
    // Wait for userId to be ready
    if (!userId) return;
    
    // Check if favorites in localStorage belong to current user
    try {
      const storedUserId = localStorage.getItem("notes-favorite-tags-user-id");
      const stored = localStorage.getItem("notes-favorite-tags");
      
      if (storedUserId === userId && stored) {
        // Same user → Load from localStorage (instant)
        setFavoriteTags(new Set(JSON.parse(stored)));
      } else if (storedUserId && storedUserId !== userId) {
        // Different user → Clear old favorites
        console.log("User ID mismatch, clearing old favorites");
        setFavoriteTags(new Set());
        localStorage.removeItem("notes-favorite-tags");
        localStorage.setItem("notes-favorite-tags-user-id", userId);
      } else {
        // First time → Set user ID
        localStorage.setItem("notes-favorite-tags-user-id", userId);
      }
    } catch {
      // ignore
    }
    
    // Then sync with server in background
    fetch("/api/favorites", {
      headers: {
        "X-User-ID": userId,
      },
    })
      .then(res => {
        if (!res.ok) throw new Error("Failed to fetch favorites");
        return res.json();
      })
      .then(data => {
        if (data.favorites && Array.isArray(data.favorites)) {
          const serverFavorites = new Set<string>(data.favorites);
          setFavoriteTags(serverFavorites);
          try {
            localStorage.setItem("notes-favorite-tags", JSON.stringify(data.favorites));
            localStorage.setItem("notes-favorite-tags-user-id", userId);
          } catch {
            // ignore
          }
        }
      })
      .catch(err => {
        console.error("Failed to sync favorites from server:", err);
        // Continue with localStorage data
      });
    
    // Cleanup debounce timers on unmount
    return () => {
      Object.values(debounceTimerRef.current).forEach(timer => clearTimeout(timer));
    };
  }, [userId]);

  // Resolve ?tab=slug → mode + tag once tags are loaded
  useEffect(() => {
    if (tags.length === 0) return;
    
    // If no tab param, default to show-all mode
    if (!initialTabParam) {
      setViewMode("show-all");
      setActiveTag(null);
      return;
    }
    
    // Check if it's a mode
    if (initialTabParam === "favorites") {
      setViewMode("favorites");
      setActiveTag(null);
      return;
    }
    
    if (initialTabParam === "show-all") {
      setViewMode("show-all");
      setActiveTag(null);
      return;
    }
    
    // Otherwise it's a tag slug
    const matched = tags.find((t) => tagSlug(t.name) === initialTabParam);
    if (matched) {
      setViewMode("show-all"); // Default to show-all mode when accessing via tag
      setActiveTag(matched.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tags]);

  const switchTag = useCallback(
    (tagId: string | null) => {
      setActiveTag(tagId);
      setLocalSearch("");
      
      // Update URL
      const params = new URLSearchParams(window.location.search);
      if (tagId) {
        const tag = tags.find((t) => t.id === tagId);
        params.set("tab", tag ? tagSlug(tag.name) : tagId);
      } else {
        params.set("tab", viewMode);
      }
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `/notes?${qs}` : "/notes");
    },
    [tags, viewMode],
  );

  // Switch view mode (favorites <-> show-all)
  const switchViewMode = useCallback((mode: "favorites" | "show-all") => {
    setViewMode(mode);
    setActiveTag(null); // Reset active tag when switching mode
    setLocalSearch("");
    
    // Update URL
    const params = new URLSearchParams(window.location.search);
    params.set("tab", mode);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `/notes?${qs}` : "/notes");
  }, []);

  // Debounce timer ref for API calls
  const debounceTimerRef = useRef<Record<string, NodeJS.Timeout>>({});

  // Confetti effect for favorite action
  const shootConfetti = useCallback((x: number, y: number) => {
    const originX = x / window.innerWidth;
    const originY = y / window.innerHeight;
    
    const defaults = {
      spread: 360,
      ticks: 50,
      gravity: 0,
      decay: 0.94,
      startVelocity: 30,
      colors: ['FFE400', 'FFBD00', 'E89400', 'FFCA6C', 'FDFFB8'],
      origin: { x: originX, y: originY }
    };
    
    function shoot() {
      confetti({
        ...defaults,
        particleCount: 40,
        scalar: 1.2,
        shapes: ['star']
      });
      
      confetti({
        ...defaults,
        particleCount: 10,
        scalar: 0.75,
        shapes: ['circle']
      });
    }
    
    setTimeout(shoot, 0);
    setTimeout(shoot, 100);
    setTimeout(shoot, 200);
  }, []);

  // Toggle favorite tag with optimistic updates + debouncing
  const toggleFavorite = useCallback((tagId: string, x?: number, y?: number) => {
    // Don't allow toggle if userId not ready
    if (!userId) {
      console.warn("User ID not ready yet");
      return;
    }
    
    const newFavorites = new Set(favoriteTags);
    const isFavorite = newFavorites.has(tagId);
    const previousState = new Set(favoriteTags); // Backup for rollback
    
    // STEP 1: Update UI immediately (Optimistic)
    if (isFavorite) {
      newFavorites.delete(tagId);
    } else {
      newFavorites.add(tagId);
      // Trigger confetti effect when favoriting (not unfavoriting)
      if (x !== undefined && y !== undefined) {
        shootConfetti(x, y);
      }
    }
    setFavoriteTags(newFavorites);
    
    // Persist to localStorage immediately
    try {
      localStorage.setItem("notes-favorite-tags", JSON.stringify(Array.from(newFavorites)));
    } catch {
      // ignore
    }
    
    // STEP 2: Debounce API call (300ms)
    // Clear existing timer for this tag
    if (debounceTimerRef.current[tagId]) {
      clearTimeout(debounceTimerRef.current[tagId]);
    }
    
    // Set new timer
    debounceTimerRef.current[tagId] = setTimeout(async () => {
      try {
        const response = await fetch(
          isFavorite ? `/api/favorites?tagId=${tagId}` : "/api/favorites",
          {
            method: isFavorite ? "DELETE" : "POST",
            headers: { 
              "Content-Type": "application/json",
              "X-User-ID": userId,
            },
            body: isFavorite ? undefined : JSON.stringify({ tagId }),
          }
        );
        
        if (!response.ok) {
          throw new Error(`API failed with status ${response.status}`);
        }
        
        // Success - cleanup timer
        delete debounceTimerRef.current[tagId];
      } catch (error) {
        // STEP 3: Rollback on error
        console.error("Failed to update favorite:", error);
        
        // Revert to previous state
        setFavoriteTags(previousState);
        try {
          localStorage.setItem("notes-favorite-tags", JSON.stringify(Array.from(previousState)));
        } catch {
          // ignore
        }
        
        // Show error toast
        toast("Failed to update favorite. Please try again.", "error");
        
        // Cleanup timer
        delete debounceTimerRef.current[tagId];
      }
    }, 300);
  }, [favoriteTags, toast, shootConfetti, userId]);

  // Form states
  const [showPostForm, setShowPostForm] = useState(false);
  const [editingPost, setEditingPost] = useState<PostWithTags | null>(null);
  const [viewingPost, setViewingPost] = useState<PostWithTags | null>(null);
  const [showTagForm, setShowTagForm] = useState(false);
  const [editingTag, setEditingTag] = useState<TagWithPostCount | null>(null);
  const [showTagManager, setShowTagManager] = useState(false);

  // Post drawer: single drawer for both view/edit
  const [drawerPost, setDrawerPost] = useState<PostWithTags | null>(null);
  const [drawerMode, setDrawerMode] = useState<"view" | "edit">("view");

  // Tag long-press context menu
  const [tagContextMenu, setTagContextMenu] = useState<{
    tagId: string;
    x: number;
    y: number;
    buttonElement?: HTMLElement; // Add reference to tag button
  } | null>(null);
  const tagLongPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Custom confirm dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const showConfirm = useCallback(
    (title: string, message: string, onConfirm: () => void) => {
      setConfirmDialog({ title, message, onConfirm });
    },
    [],
  );

  // Global Esc handler for tag context menu + confirm dialog
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmDialog) {
          setConfirmDialog(null);
          e.stopPropagation();
          return;
        }
        if (tagContextMenu) {
          setTagContextMenu(null);
          e.stopPropagation();
          return;
        }
      }
    };
    document.addEventListener("keydown", handleKey, true); // capture phase
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [tagContextMenu, confirmDialog]);

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
  }, [activeTag, viewMode]);

  const refresh = useCallback(async () => {
    try {
      const ts = Date.now(); // cache-busting
      const headers = { "Cache-Control": "no-cache", Pragma: "no-cache" };
      const [postsRes, tagsRes] = await Promise.all([
        fetch(`/api/posts?_t=${ts}`, { cache: "no-store", headers }).then((r) =>
          r.ok ? r.json() : [],
        ),
        fetch(`/api/tags?_t=${ts}`, { cache: "no-store", headers }).then((r) =>
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
    setDrawerPost(null);
    setDrawerMode("view");
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
        toast(`Backup #${data.index} saved → MD + JSON in /docs`);
      } else {
        toast(data.error || "Failed to save backup", "error");
      }
    } catch {
      toast("Error saving backup", "error");
    }
  };

  // ----- Custom order per tag (persisted in localStorage) -----
  const [tagOrders, setTagOrders] = useState<Record<string, string[]>>({});

  // Load orders from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("notes-tag-orders");
      if (stored) {
        setTagOrders(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
  }, []);

  // Persist orders whenever they change
  const persistTagOrders = useCallback((next: Record<string, string[]>) => {
    setTagOrders(next);
    try {
      localStorage.setItem("notes-tag-orders", JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const filteredPosts = useMemo(() => {
    let matched = posts;

    // Apply view mode filter first
    if (viewMode === "favorites") {
      matched = posts.filter((post) => 
        post.tags.some((t) => favoriteTags.has(t.id))
      );
    }

    // Then apply tag filter if a tag is selected
    if (activeTag) {
      matched = matched.filter((post) =>
        post.tags.some((t) => t.id === activeTag)
      );
    }

    // Finally apply search filter
    if (searchQuery) {
      matched = matched.filter((post) =>
        post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (post.content &&
          post.content.toLowerCase().includes(searchQuery.toLowerCase())) ||
        post.slug.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Sort based on context
    if (!activeTag) {
      if (viewMode === "favorites") {
        // Favorites mode without tag → sort by createdAt DESC
        return [...matched].sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
      } else {
        // Show-all mode without tag → sort A-Z by title
        return [...matched].sort((a, b) =>
          a.title.localeCompare(b.title, "vi", { sensitivity: "base" }),
        );
      }
    }

    // Specific tag selected → use custom order
    const customOrder = tagOrders[activeTag] ?? [];
    const orderIndex = new Map(customOrder.map((id, i) => [id, i]));
    return [...matched].sort((a, b) => {
      const ai = orderIndex.has(a.id) ? orderIndex.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const bi = orderIndex.has(b.id) ? orderIndex.get(b.id)! : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [posts, activeTag, searchQuery, tagOrders, favoriteTags, viewMode]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDragId(null);
      if (!over || active.id === over.id) return;
      if (!activeTag) return; // No DnD when no tag is selected

      const ids = filteredPosts.map((p) => p.id);
      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;

      const newOrder = arrayMove(ids, oldIndex, newIndex);
      persistTagOrders({ ...tagOrders, [activeTag]: newOrder });
    },
    [activeTag, filteredPosts, tagOrders, persistTagOrders],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  }, []);

  const handleDragCancel = useCallback(() => {
    setActiveDragId(null);
  }, []);

  // Use long-press to activate drag, allowing normal clicks to open detail
  const sensors = useSensors(
    useSensor(PointerSensor, {
      // 250ms hold + 5px tolerance before drag starts
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(TouchSensor, {
      // Mobile long-press 300ms
      activationConstraint: { delay: 300, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Active dragging post id (for DragOverlay)
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const activeDragPost = activeDragId
    ? filteredPosts.find((p) => p.id === activeDragId) ?? null
    : null;

  const activeTagObj = tags.find((t) => t.id === activeTag) ?? null;
  const tagHasPosts = activeTag
    ? posts.some((post) => post.tags.some((t) => t.id === activeTag))
    : posts.length > 0;

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
      <div className="absolute top-0 right-0 w-72 h-72 bg-steel/5 blur-3xl rounded-full -z-10" />

      {/* ------------------------------------------------------------------ */}
      {/* Header                                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-4 lg:mb-12 mt-2">
        <div className="flex-shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="h-1.5 w-1.5 rounded-full bg-steel animate-pulse" />
            <p className="text-xs font-mono text-muted-foreground tracking-widest uppercase">
              {new Date().getFullYear()} · {posts.length} entries total
            </p>
            <ThemeToggle />
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
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Search & Tags bar                                                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="lg:mb-10 mb-4 relative group">
        <LayoutGroup>
          <div
            ref={tabBarRef}
            onScroll={checkScroll}
            className="flex flex-wrap items-center gap-2 pb-4 overflow-visible [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          >
          {/* Simple Favorites Toggle */}
          <div className="flex items-center gap-2 px-3 py-2 bg-card/50 rounded-full border border-border/40 shrink-0">
            <Star className={cn("w-3.5 h-3.5 transition-all", viewMode === "favorites" ? "text-amber-500 fill-amber-500" : "text-muted-foreground")} />
            <span className="text-xs font-medium text-muted-foreground">Only favorites</span>
            <button
              onClick={() => switchViewMode(viewMode === "favorites" ? "show-all" : "favorites")}
              className={cn(
                "relative w-9 h-5 rounded-full transition-colors",
                viewMode === "favorites" ? "bg-amber-500" : "bg-muted"
              )}
            >
              <motion.div
                className="absolute top-0.5 w-4 h-4 bg-background rounded-full shadow-sm"
                animate={{ left: viewMode === "favorites" ? "18px" : "2px" }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            </button>
          </div>

          {/* Divider */}
          <div className="h-8 w-px bg-border/40 shrink-0" />

          {/* Tags - filter by favorites mode, no reordering */}
          {(() => {
            // Filter tags based on favorites mode, keep original order
            const displayTags = viewMode === "favorites"
              ? tags.filter(tag => favoriteTags.has(tag.id))
              : tags;
            
            return displayTags.map((tag) => {
              const isFavorite = favoriteTags.has(tag.id);
              return (
            <motion.button
              key={tag.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{
                opacity: { duration: 0.2 },
                scale: { duration: 0.2, ease: "easeOut" }
              }}
              data-active={activeTag === tag.id}
              onClick={() => switchTag(tag.id)}
              onPointerDown={(e) => {
                // Start long-press timer
                tagLongPressRef.current = setTimeout(() => {
                  setTagContextMenu({
                    tagId: tag.id,
                    x: e.clientX,
                    y: e.clientY,
                    buttonElement: e.currentTarget as HTMLElement,
                  });
                }, 500);
              }}
              onPointerUp={() => {
                if (tagLongPressRef.current) {
                  clearTimeout(tagLongPressRef.current);
                  tagLongPressRef.current = null;
                }
              }}
              onPointerLeave={() => {
                if (tagLongPressRef.current) {
                  clearTimeout(tagLongPressRef.current);
                  tagLongPressRef.current = null;
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setTagContextMenu({
                  tagId: tag.id,
                  x: e.clientX,
                  y: e.clientY,
                  buttonElement: e.currentTarget as HTMLElement,
                });
              }}
              className={cn(
                "relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium shrink-0 rounded-full cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-foreground/50 border-2 select-none overflow-visible group/tag",
                "transition-[border-color,box-shadow] duration-300 ease-in-out",
                activeTag === tag.id
                  ? "text-background border-transparent"
                  : isFavorite
                    ? "bg-card hover:bg-muted/50 text-muted-foreground hover:text-foreground border-amber-500/60 shadow-sm shadow-amber-500/10"
                    : "bg-card hover:bg-muted/50 text-muted-foreground hover:text-foreground border-border/40"
              )}
              style={{ isolation: "isolate" }}
            >
              {activeTag === tag.id && (
                <motion.div
                  className="absolute inset-0 rounded-full bg-foreground shadow-sm shadow-foreground/20"
                  layoutId="activeTagBackground"
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
                  activeTag === tag.id
                    ? "bg-background/20 text-background"
                    : "bg-muted text-muted-foreground/80",
                )}
              >
                {tag.postCount}
              </span>
            </motion.button>
          );
          });
          })()}

          {/* Add Tag button */}
          <button
            onClick={() => {
              closeAllForms();
              setShowTagForm(true);
            }}
            className="relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium shrink-0 rounded-full cursor-pointer outline-none border border-dashed border-border/60 text-muted-foreground hover:text-foreground hover:border-steel/40 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tag</span>
          </button>
        </div>
        </LayoutGroup>

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

      {/* Tag context menu (long-press / right-click) */}
      {tagContextMenu && (
        <>
          <div
            className="fixed inset-0 z-[200]"
            onClick={() => setTagContextMenu(null)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="fixed z-[201] bg-card border border-border/50 rounded-xl shadow-xl p-1.5 min-w-[160px]"
            style={{
              top: tagContextMenu.y,
              left: tagContextMenu.x,
              transform: "translate(-50%, 8px)",
            }}
          >
            <button
              onClick={() => {
                const tag = tags.find((t) => t.id === tagContextMenu.tagId);
                if (tag) {
                  const willBeFavorite = !favoriteTags.has(tag.id);
                  
                  // Get confetti position from tag button (center of button)
                  let confettiX = tagContextMenu.x;
                  let confettiY = tagContextMenu.y;
                  
                  if (tagContextMenu.buttonElement) {
                    const rect = tagContextMenu.buttonElement.getBoundingClientRect();
                    confettiX = rect.left + rect.width / 2;
                    confettiY = rect.top + rect.height / 2;
                  }
                  
                  toggleFavorite(tag.id, confettiX, confettiY);
                  setTagContextMenu(null);
                  toast(
                    willBeFavorite
                      ? `Added "${tag.name}" to favorites` 
                      : `Removed "${tag.name}" from favorites`
                  );
                }
              }}
              className={cn(
                "flex items-center gap-2 w-full px-3 py-2 text-xs font-medium rounded-lg transition-all cursor-pointer text-left",
                favoriteTags.has(tagContextMenu.tagId)
                  ? "hover:bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "hover:bg-muted"
              )}
            >
              <motion.div
                whileHover={{ scale: 1.1, rotate: 15 }}
                whileTap={{ scale: 0.9 }}
              >
                <Star className={cn(
                  "w-3.5 h-3.5 transition-all",
                  favoriteTags.has(tagContextMenu.tagId) && "fill-amber-500 text-amber-500"
                )} />
              </motion.div>
              {favoriteTags.has(tagContextMenu.tagId) ? "Remove from Favorites" : "Add to Favorites"}
            </button>
            <button
              onClick={() => {
                const tag = tags.find((t) => t.id === tagContextMenu.tagId);
                if (tag) {
                  setTagContextMenu(null);
                  closeAllForms();
                  setEditingTag(tag);
                }
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium rounded-lg hover:bg-muted transition-colors cursor-pointer text-left"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit Tag
            </button>
            <button
              onClick={async () => {
                const tag = tags.find((t) => t.id === tagContextMenu.tagId);
                if (!tag) return;
                setTagContextMenu(null);
                if (tag.postCount > 0) {
                  toast(`Cannot delete "${tag.name}" — it has posts`, "error");
                  return;
                }
                showConfirm(
                  "Xóa tag",
                  `Bạn có chắc chắn muốn xóa tag "${tag.name}"? Hành động này không thể hoàn tác.`,
                  async () => {
                    const res = await fetch(`/api/tags/${tag.id}`, {
                      method: "DELETE",
                    });
                    if (!res.ok) {
                      toast(`Failed to delete "${tag.name}"`, "error");
                      return;
                    }
                    if (activeTag === tag.id) setActiveTag(null);
                    setTags((prev) => prev.filter((t) => t.id !== tag.id));
                    // Also remove from favorites if it was favorited
                    if (favoriteTags.has(tag.id)) {
                      toggleFavorite(tag.id);
                    }
                  },
                );
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium rounded-lg hover:bg-destructive/10 text-destructive transition-colors cursor-pointer text-left"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Tag
            </button>
          </motion.div>
        </>
      )}

      {/* Confirm Dialog */}
      <AnimatePresence>
        {confirmDialog && (
          <motion.div
            className="fixed inset-0 z-[300] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className="absolute inset-0 bg-background/60 backdrop-blur-sm"
              onClick={() => setConfirmDialog(null)}
            />
            <motion.div
              className="relative bg-card border border-border/50 rounded-2xl shadow-2xl p-6 w-full max-w-sm"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-base font-bold text-foreground">
                  {confirmDialog.title}
                </h3>
                <button
                  onClick={() => setConfirmDialog(null)}
                  className="p-1 text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                {confirmDialog.message}
              </p>
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setConfirmDialog(null)}
                  className="px-5 py-2.5 text-xs font-semibold text-foreground bg-secondary hover:bg-secondary/80 rounded-full border border-border/30 transition-all cursor-pointer"
                >
                  Huỷ
                </button>
                <button
                  onClick={async () => {
                    await confirmDialog.onConfirm();
                    setConfirmDialog(null);
                  }}
                  className="px-5 py-2.5 text-xs font-semibold text-white bg-destructive hover:bg-destructive/90 rounded-full transition-all cursor-pointer"
                >
                  Xoá
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------------ */}
      {/* Modals                                                             */}
      {/* ------------------------------------------------------------------ */}
      <AnimatePresence>
        {showPostForm && !drawerPost && (
          <Drawer onClose={closeAllForms}>
            <PostForm
              post={null}
              tags={tags}
              preselectedTagId={activeTag ?? undefined}
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
                setPosts((prev) => [...prev, enriched]);
                const newTagIds = enriched.tags.map((t) => t.id);
                setTags((prev) =>
                  prev.map((t) =>
                    newTagIds.includes(t.id)
                      ? { ...t, postCount: t.postCount + 1 }
                      : t,
                  ),
                );
              }}
              onCancel={closeAllForms}
            />
          </Drawer>
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
                } else {
                  setTags((prev) => [...prev, { ...savedTag, postCount: 0 }]);
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
                showConfirm(
                  "Xóa tag",
                  `Bạn có chắc chắn muốn xóa tag "${tag.name}"? Hành động này không thể hoàn tác.`,
                  async () => {
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
                    if (activeTag === tag.id) setActiveTag(null);
                    setTags((prev) => prev.filter((t) => t.id !== tag.id));
                  },
                );
              }}
              onCancel={closeAllForms}
            />
          </Modal>
        )}
      </AnimatePresence>

      {/* Unified Post View/Edit Drawer */}
      <AnimatePresence>
        {drawerPost && (
          <Drawer
            onClose={closeAllForms}
            widthClass="sm:w-[80%] lg:w-[60%]"
          >
            <div className="flex-1 min-h-0 relative">
            <AnimatePresence mode="wait" initial={false}>
              {drawerMode === "view" ? (
                <motion.div
                  key="view"
                  className="absolute inset-0 flex flex-col"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.15 }}
                >
                  <PostDetailView
                    post={drawerPost}
                    onEdit={() => setDrawerMode("edit")}
                    onDelete={async () => {
                      showConfirm(
                        "Xóa ghi chú",
                        "Bạn có chắc chắn muốn xóa ghi chú này? Hành động này không thể hoàn tác.",
                        async () => {
                          const res = await fetch(`/api/posts/${drawerPost.id}`, {
                            method: "DELETE",
                          });
                          if (!res.ok) {
                            toast("Failed to delete post", "error");
                            return;
                          }
                          const deletedTagIds = drawerPost.tags.map((t) => t.id);
                          setTags((prev) =>
                            prev.map((t) =>
                              deletedTagIds.includes(t.id)
                                ? { ...t, postCount: Math.max(0, t.postCount - 1) }
                                : t,
                            ),
                          );
                          setPosts((prev) =>
                            prev.filter((p) => p.id !== drawerPost.id),
                          );
                          closeAllForms();
                        },
                      );
                    }}
                    onClose={closeAllForms}
                    onPrev={
                      (() => {
                        const idx = filteredPosts.findIndex((p) => p.id === drawerPost.id);
                        return idx > 0
                          ? () => setDrawerPost(filteredPosts[idx - 1])
                          : undefined;
                      })()
                    }
                    onNext={
                      (() => {
                        const idx = filteredPosts.findIndex((p) => p.id === drawerPost.id);
                        return idx >= 0 && idx < filteredPosts.length - 1
                          ? () => setDrawerPost(filteredPosts[idx + 1])
                          : undefined;
                      })()
                    }
                    prevTitle={
                      (() => {
                        const idx = filteredPosts.findIndex((p) => p.id === drawerPost.id);
                        return idx > 0 ? filteredPosts[idx - 1].title : undefined;
                      })()
                    }
                    nextTitle={
                      (() => {
                        const idx = filteredPosts.findIndex((p) => p.id === drawerPost.id);
                        return idx >= 0 && idx < filteredPosts.length - 1
                          ? filteredPosts[idx + 1].title
                          : undefined;
                      })()
                    }
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="edit"
                  className="absolute inset-0 flex flex-col"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                >
                  <PostForm
                    post={drawerPost}
                    tags={tags}
                    preselectedTagId={activeTag ?? undefined}
                    saving={saving}
                    setSaving={setSaving}
                    onSaved={(savedPost) => {
                      const tagMap = Object.fromEntries(
                        tags.map((t) => [t.id, t]),
                      );
                      const enriched: PostWithTags = {
                        ...savedPost,
                        tags: (
                          savedPost.tagIds ??
                          savedPost.tags?.map((t) => t.id) ??
                          []
                        ).flatMap((id: string) =>
                          tagMap[id] ? [tagMap[id]] : [],
                        ),
                      };
                      setPosts((prev) =>
                        prev.map((p) =>
                          p.id === enriched.id ? enriched : p,
                        ),
                      );
                      // Update tag counts
                      const oldTagIds = drawerPost.tags.map((t) => t.id);
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
                      // Switch back to view mode with updated post
                      setDrawerPost(enriched);
                      setDrawerMode("view");
                      toast("Post updated successfully");
                    }}
                    onCancel={() => setDrawerMode("view")}
                  />
                </motion.div>
              )}
            </AnimatePresence>
            </div>
          </Drawer>
        )}
      </AnimatePresence>

      {/* -------------------------------------------------------------- */}
      {/* Search & Actions Detail Bar                                    */}
      {/* -------------------------------------------------------------- */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Mobile Top Row / Desktop Left Side */}
        <div className="flex items-center justify-between w-full sm:w-auto">
          <div className="flex items-center gap-3">
            {!activeTag ? (
              <BookOpen className="w-4 h-4 text-steel shrink-0" />
            ) : (
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ background: activeTagObj?.color }}
              />
            )}
            <p className="text-xs font-mono text-muted-foreground/70">
              {viewMode === "favorites"
                ? activeTag
                  ? `${filteredPosts.length} ${filteredPosts.length === 1 ? "note" : "notes"} from favorites in ${activeTagObj?.name}`
                  : `${filteredPosts.length} ${filteredPosts.length === 1 ? "note" : "notes"} from favorites`
                : activeTag
                ? `${posts.filter((p) => p.tags.some((t) => t.id === activeTag)).length} ${posts.filter((p) => p.tags.some((t) => t.id === activeTag)).length === 1 ? "note" : "notes"} in this tag`
                : `${posts.length} ${posts.length === 1 ? "note" : "notes"} in total`}
            </p>
          </div>

          {/* Post button for mobile (shown on left row's right side) */}
          <div className="sm:hidden flex items-center gap-2">
            {/* Favorite toggle button - mobile */}
            {activeTag && activeTagObj && (
              <motion.button
                onClick={() => toggleFavorite(activeTag)}
                className={cn(
                  "inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-xl transition-all border shadow-sm cursor-pointer shrink-0",
                  favoriteTags.has(activeTag)
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20"
                    : "bg-secondary text-secondary-foreground border-border/30 hover:bg-secondary/80"
                )}
                whileHover={{ y: -0.5 }}
                whileTap={{ scale: 0.98 }}
              >
                <Star className={cn("w-3.5 h-3.5", favoriteTags.has(activeTag) && "fill-amber-500")} />
              </motion.button>
            )}
            
            {activeTag && (
              <motion.button
                onClick={() => {
                  closeAllForms();
                  setShowPostForm(true);
                }}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-foreground text-background text-xs font-semibold rounded-xl hover:opacity-90 transition-all border border-foreground/10 shadow-sm shadow-foreground/5 cursor-pointer shrink-0"
                whileHover={{ y: -0.5 }}
                whileTap={{ scale: 0.98 }}
              >
                <Plus className="w-3.5 h-3.5" />
                Post
              </motion.button>
            )}
          </div>
        </div>

        {/* Mobile Bottom Row / Desktop Right Side */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative group w-full sm:w-64 lg:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 group-focus-within:text-steel transition-colors" />
            <input
              type="text"
              placeholder={
                viewMode === "favorites"
                  ? activeTag
                    ? `Search in favorites (${activeTagObj?.name})...`
                    : "Search in favorites..."
                  : activeTag
                  ? `Search in ${activeTagObj?.name}...`
                  : "Search all notes..."
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
          {activeTag && (
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
          key={activeTag + viewMode + searchQuery}
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
                {viewMode === "favorites"
                  ? activeTag
                    ? `No posts found in "${activeTagObj?.name}" from your favorites.`
                    : "No posts found in your favorite tags."
                  : activeTag
                  ? `There are no posts in tag "${activeTagObj?.name}" matching your search.`
                  : "Start documenting your ideas and resources today."}
              </p>
              {!tagHasPosts && activeTag && (
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
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <SortableContext
                items={filteredPosts.map((p) => p.id)}
                strategy={rectSortingStrategy}
                disabled={!activeTag}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4">
                  {filteredPosts.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      sortable={!!activeTag}
                      onView={() => {
                        closeAllForms();
                        setDrawerPost(post);
                        setDrawerMode("view");
                      }}
                    />
                  ))}
                </div>
              </SortableContext>

              {/* Floating preview while dragging */}
              <DragOverlay
                dropAnimation={{
                  duration: 200,
                  easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
                }}
              >
                {activeDragPost && (
                  <div className="rotate-2 scale-105 cursor-grabbing">
                    <PostCardPreview post={activeDragPost} />
                  </div>
                )}
              </DragOverlay>
            </DndContext>
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
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto"
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
// Drawer (slide from right — 40% desktop, 100% mobile, Esc to close)
// ---------------------------------------------------------------------------

function Drawer({
  children,
  onClose,
  widthClass = "sm:w-[60%] lg:w-[40%]",
}: {
  children: React.ReactNode;
  onClose: () => void;
  widthClass?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [dragX, setDragX] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Prevent body scroll while drawer is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isMobile) return;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    isDraggingRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isMobile || !touchStartRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;

    // Only start drag if horizontal movement dominates and is rightward
    if (!isDraggingRef.current) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5 && dx > 0) {
        isDraggingRef.current = true;
      } else {
        return;
      }
    }

    if (isDraggingRef.current && dx > 0) {
      setDragX(dx);
    }
  };

  const handleTouchEnd = () => {
    if (!isMobile || !touchStartRef.current) return;
    const elapsed = Date.now() - touchStartRef.current.time;
    const velocity = dragX / elapsed * 1000;

    if (isDraggingRef.current) {
      if (dragX > 100 || velocity > 300) {
        onClose();
      } else {
        setDragX(0);
      }
    }

    touchStartRef.current = null;
    isDraggingRef.current = false;
  };

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex justify-end"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-background/60"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      {/* Panel — swipe right to close on mobile only */}
      <motion.div
        ref={panelRef}
        className={cn(
          "relative w-full h-full bg-card border-l border-border/50 shadow-2xl flex flex-col",
          widthClass,
        )}
        initial={{ x: "100%" }}
        animate={{ x: dragX }}
        exit={{ x: "100%" }}
        transition={dragX > 0 ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 35 }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Swipe indicator — mobile only */}
        <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0 relative">
          <div className="w-8 h-1 rounded-full bg-border/60" />
        </div>
        <div className="flex-1 min-h-0 flex flex-col relative">{children}</div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Premium Post Card
// ---------------------------------------------------------------------------

function PostCard({
  post,
  onView,
  sortable = false,
}: {
  post: PostWithTags;
  onView: () => void;
  sortable?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: post.id, disabled: !sortable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const date = new Date(post.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(sortable ? listeners : {})}
      className={cn(
        "group relative flex flex-col justify-between p-4 bg-card border border-border/30 hover:border-steel/30 rounded-2xl transition-all shadow-sm hover:shadow-md duration-300 h-full",
        sortable && "cursor-grab active:cursor-grabbing touch-none",
        isDragging && "ring-2 ring-steel/40",
      )}
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
            {post.content && post.content.trim()
              ? stripHtml(post.content)
              : "N/A"}
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Post Card Preview (for DragOverlay)
// ---------------------------------------------------------------------------

function PostCardPreview({ post }: { post: PostWithTags }) {
  const date = new Date(post.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="relative flex flex-col justify-between p-4 bg-card border border-steel/40 rounded-2xl shadow-2xl shadow-foreground/10 backdrop-blur">
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
              <span className="w-1 h-1 rounded-full" style={{ background: tag.color }} />
              {tag.name}
            </span>
          ))}
        </div>
      </div>
      <h3 className="text-base font-bold text-foreground tracking-tight line-clamp-1 mb-1">
        {post.title}
      </h3>
      <p className="text-[11px] text-muted-foreground/70 line-clamp-2 mb-3 leading-relaxed">
        {post.content && post.content.trim() ? stripHtml(post.content) : "N/A"}
      </p>
      <div className="flex items-center justify-between pt-2.5 border-t border-border/30 text-[10px] font-mono text-muted-foreground/60">
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          <time className="tabular-nums">{date}</time>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Post Detail View (read-only modal)
// ---------------------------------------------------------------------------

function PostDetailView({
  post,
  onEdit,
  onDelete,
  onClose,
  onPrev,
  onNext,
  prevTitle,
  nextTitle,
}: {
  post: PostWithTags;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  prevTitle?: string;
  nextTitle?: string;
}) {
  const [previewImage, setPreviewImage] = React.useState<{ src: string; alt: string } | null>(null);
  const clickTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const clickCountRef = React.useRef(0);
  const lastClickedImageRef = React.useRef<HTMLImageElement | null>(null);

  const date = new Date(post.createdAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-5">
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
      </div>

      <div className="border-t border-border/30 pt-5">
        {post.content && post.content.trim() ? (
          <div
            className="prose prose-sm dark:prose-invert max-w-none text-foreground/80 [&_a]:text-steel [&_a]:underline [&_a]:underline-offset-2 select-none"
            dangerouslySetInnerHTML={{ __html: contentToHtml(post.content) }}
            onClick={(e) => {
              const target = e.target as HTMLElement;
              
              // Handle image double-click for preview
              if (target.tagName === "IMG") {
                const img = target as HTMLImageElement;
                
                // Track clicks for double-click detection
                if (lastClickedImageRef.current === img) {
                  clickCountRef.current += 1;
                } else {
                  clickCountRef.current = 1;
                  lastClickedImageRef.current = img;
                }
                
                if (clickCountRef.current === 1) {
                  clickTimeoutRef.current = setTimeout(() => {
                    clickCountRef.current = 0;
                    lastClickedImageRef.current = null;
                  }, 300);
                } else if (clickCountRef.current === 2) {
                  if (clickTimeoutRef.current) {
                    clearTimeout(clickTimeoutRef.current);
                  }
                  clickCountRef.current = 0;
                  lastClickedImageRef.current = null;
                  
                  // Open preview
                  setPreviewImage({
                    src: img.src,
                    alt: img.alt || 'Image',
                  });
                  return;
                }
              }
              
              // Handle link clicks
              const anchor = target.closest("a");
              if (anchor) {
                e.preventDefault();
                window.open(anchor.href, "_blank", "noopener,noreferrer");
                return;
              }
              
              // Handle copy button clicks
              const copyBtn = target.closest("[data-copy]") as HTMLButtonElement;
              if (copyBtn) {
                e.preventDefault();
                const callout = copyBtn.closest(".callout");
                const contentEl = callout?.querySelector(".callout-content");
                
                // Get text with line breaks preserved
                let text = "";
                if (contentEl) {
                  // Clone to avoid modifying original
                  const clone = contentEl.cloneNode(true) as HTMLElement;
                  // Replace <br> with newlines
                  clone.querySelectorAll("br").forEach(br => br.replaceWith("\n"));
                  // Replace block elements with newlines
                  clone.querySelectorAll("p, div").forEach(el => {
                    el.prepend(document.createTextNode("\n"));
                  });
                  text = clone.textContent || "";
                } else if (callout) {
                  text = callout.textContent || "";
                }
                
                navigator.clipboard.writeText(text.trim());
                
                // Show checkmark
                const originalHtml = copyBtn.innerHTML;
                copyBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                setTimeout(() => {
                  copyBtn.innerHTML = originalHtml;
                }, 1500);
              }
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground/60">No content.</p>
        )}
      </div>
      </div>

      {/* Pinned bottom actions - always visible */}
      <div className="shrink-0 bg-card border-t border-border/40 px-6 md:px-8 py-3 flex items-center justify-between gap-3">
        {/* Left: Delete + Edit */}
        <div className="flex items-center gap-2">
          <button
            onClick={onDelete}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-destructive/10 text-destructive text-xs font-semibold rounded-xl border border-destructive/20 transition-all cursor-pointer hover:bg-destructive/20"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
          <button
            onClick={onEdit}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-foreground text-background text-xs font-semibold rounded-xl transition-all cursor-pointer hover:opacity-90"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
        </div>

        {/* Right: Prev/Next navigation */}
        <div className="flex items-center gap-2">
          {onPrev && (
            <button
              onClick={onPrev}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-secondary hover:bg-secondary/80 rounded-xl border border-border/30 transition-all cursor-pointer max-w-[120px] overflow-hidden"
              title={prevTitle}
            >
              <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{prevTitle}</span>
            </button>
          )}
          {onNext && (
            <button
              onClick={onNext}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground bg-secondary hover:bg-secondary/80 rounded-xl border border-border/30 transition-all cursor-pointer max-w-[120px] overflow-hidden"
              title={nextTitle}
            >
              <span className="truncate">{nextTitle}</span>
              <ChevronRight className="w-3.5 h-3.5 shrink-0" />
            </button>
          )}
        </div>
      </div>

      {/* Image Preview */}
      {previewImage && (
        <ImagePreview
          src={previewImage.src}
          alt={previewImage.alt}
          visible={!!previewImage}
          onClose={() => setPreviewImage(null)}
        />
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
    <form onSubmit={handleSubmit} className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
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
          <Editor
            value={content}
            onChange={(val) => setContent(val)}
            minContentHeight={200}
            namespace="NotesEditor"
            showTopbar={false}
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
      </div>

      {/* Pinned bottom actions - always visible */}
      <div className="shrink-0 bg-card border-t border-border/40 px-6 md:px-8 py-3 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-secondary text-secondary-foreground text-xs font-semibold rounded-xl border border-border/30 transition-all cursor-pointer hover:bg-secondary/80"
        >
          <X className="w-3.5 h-3.5 sm:hidden" />
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-foreground text-background text-xs font-semibold rounded-xl disabled:opacity-40 transition-all cursor-pointer hover:opacity-90"
        >
          <Check className="w-3.5 h-3.5 sm:hidden" />
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
