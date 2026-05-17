"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Plus, X, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import type { PostWithTags, TagWithPostCount } from "@/lib/notion-types";

interface Props {
  initialPosts: PostWithTags[];
  initialTags: TagWithPostCount[];
}

const PRESET_COLORS = [
  "#6b9ac4", "#8bb5d9", "#10b981",
  "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#64748b",
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function NotesClient({ initialPosts, initialTags }: Props) {
  const [posts, setPosts] = useState<PostWithTags[]>(initialPosts);
  const [tags, setTags] = useState<TagWithPostCount[]>(initialTags);
  const [saving, setSaving] = useState(false);

  // Which tag section has the "new post" form open
  const [newPostForTag, setNewPostForTag] = useState<string | null>(null);
  // Which post is being edited (id)
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  // Tag form state: null = closed, "new" = create, string = tag id being edited
  const [tagFormState, setTagFormState] = useState<null | "new" | string>(null);

  const refresh = useCallback(async () => {
    const [postsRes, tagsRes] = await Promise.all([
      fetch("/api/posts").then((r) => r.json()),
      fetch("/api/tags").then((r) => r.json()),
    ]);
    const tagMap = Object.fromEntries(
      (tagsRes as TagWithPostCount[]).map((t: TagWithPostCount) => [t.id, t])
    );
    const enriched: PostWithTags[] = (
      postsRes as (Omit<PostWithTags, "tags"> & { tagIds?: string[] })[]
    ).map(({ tagIds, ...post }) => ({
      ...post,
      tags: (tagIds ?? []).flatMap((id) => (tagMap[id] ? [tagMap[id]] : [])),
    }));
    setPosts(enriched);
    setTags(tagsRes);
  }, []);

  // Posts with no tags
  const untaggedPosts = posts.filter((p) => p.tags.length === 0);

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">

      {/* Header */}
      <div className="flex items-start justify-between mb-12">
        <div>
          <p className="text-xs font-mono text-muted-foreground tracking-widest uppercase mb-2">
            {new Date().getFullYear()} · {posts.length} entries
          </p>
          <h1 className="text-3xl font-display font-bold tracking-tight text-foreground">
            Notes
          </h1>
        </div>
        <div className="flex items-center gap-2 mt-1">
          {tagFormState === null ? (
            <button
              onClick={() => setTagFormState("new")}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-muted text-muted-foreground text-xs font-medium rounded-lg hover:text-foreground transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Tag
            </button>
          ) : tagFormState === "new" ? (
            <button
              onClick={() => setTagFormState(null)}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/50"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>
      </div>

      {/* New tag form */}
      {tagFormState === "new" && (
        <TagForm
          saving={saving}
          setSaving={setSaving}
          onSaved={() => { setTagFormState(null); refresh(); }}
          onCancel={() => setTagFormState(null)}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Tag sections                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-10">
        {tags.map((tag) => {
          const tagPosts = posts.filter((p) => p.tags.some((t) => t.id === tag.id));
          const isEditingTag = tagFormState === tag.id;
          const isAddingPost = newPostForTag === tag.id;

          return (
            <section key={tag.id}>
              {/* Tag header */}
              {isEditingTag ? (
                <TagForm
                  tag={tag}
                  saving={saving}
                  setSaving={setSaving}
                  onSaved={() => { setTagFormState(null); refresh(); }}
                  onCancel={() => setTagFormState(null)}
                />
              ) : (
                <div className="group/taghdr flex items-center gap-3 mb-4">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: tag.color }}
                  />
                  <h2 className="text-sm font-semibold text-foreground tracking-wide">
                    {tag.name}
                  </h2>
                  <span className="text-xs font-mono text-muted-foreground">
                    {tagPosts.length}
                  </span>

                  {/* Tag actions — hover */}
                  <span className="ml-auto flex items-center gap-1 opacity-0 group-hover/taghdr:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        setNewPostForTag(isAddingPost ? null : tag.id);
                        setEditingPostId(null);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md transition-colors"
                      title="Add post to this tag"
                    >
                      <Plus className="w-3 h-3" />
                      Post
                    </button>
                    <button
                      onClick={() => setTagFormState(tag.id)}
                      className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-md transition-colors"
                      title="Edit tag"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Delete tag "${tag.name}"?`)) return;
                        await fetch(`/api/tags/${tag.id}`, { method: "DELETE" });
                        refresh();
                      }}
                      className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                      title="Delete tag"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                </div>
              )}

              {/* New post form for this tag */}
              {isAddingPost && (
                <PostForm
                  preselectedTagId={tag.id}
                  tags={tags}
                  saving={saving}
                  setSaving={setSaving}
                  onSaved={() => { setNewPostForTag(null); refresh(); }}
                  onCancel={() => setNewPostForTag(null)}
                />
              )}

              {/* Posts under this tag */}
              {tagPosts.length > 0 ? (
                <div className="divide-y divide-border/30 border border-border/30 rounded-xl overflow-hidden">
                  {tagPosts.map((post) =>
                    editingPostId === post.id ? (
                      <div key={post.id} className="p-4 bg-muted/10">
                        <PostForm
                          post={post}
                          tags={tags}
                          saving={saving}
                          setSaving={setSaving}
                          onSaved={() => { setEditingPostId(null); refresh(); }}
                          onCancel={() => setEditingPostId(null)}
                        />
                      </div>
                    ) : (
                      <PostRow
                        key={post.id}
                        post={post}
                        onEdit={() => {
                          setEditingPostId(post.id);
                          setNewPostForTag(null);
                        }}
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
                    )
                  )}
                </div>
              ) : !isAddingPost ? (
                <button
                  onClick={() => setNewPostForTag(tag.id)}
                  className="w-full py-4 border border-dashed border-border/40 rounded-xl text-xs text-muted-foreground hover:text-foreground hover:border-border/70 transition-colors"
                >
                  + Add first post
                </button>
              ) : null}
            </section>
          );
        })}

        {/* Untagged section */}
        {untaggedPosts.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-4">
              <span className="w-2 h-2 rounded-full bg-muted-foreground/30 shrink-0" />
              <h2 className="text-sm font-semibold text-muted-foreground tracking-wide">
                Untagged
              </h2>
              <span className="text-xs font-mono text-muted-foreground">
                {untaggedPosts.length}
              </span>
            </div>
            <div className="divide-y divide-border/30 border border-border/30 rounded-xl overflow-hidden">
              {untaggedPosts.map((post) =>
                editingPostId === post.id ? (
                  <div key={post.id} className="p-4 bg-muted/10">
                    <PostForm
                      post={post}
                      tags={tags}
                      saving={saving}
                      setSaving={setSaving}
                      onSaved={() => { setEditingPostId(null); refresh(); }}
                      onCancel={() => setEditingPostId(null)}
                    />
                  </div>
                ) : (
                  <PostRow
                    key={post.id}
                    post={post}
                    onEdit={() => setEditingPostId(post.id)}
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
                )
              )}
            </div>
          </section>
        )}

        {/* Empty state */}
        {tags.length === 0 && posts.length === 0 && (
          <div className="py-24 text-center border border-dashed border-border/50 rounded-xl">
            <p className="text-muted-foreground text-sm mb-2">No tags yet.</p>
            <p className="text-xs text-muted-foreground/60">Create a tag first, then add posts to it.</p>
          </div>
        )}
      </div>
    </div>
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
    <div className="group flex items-start gap-4 px-4 py-3.5 hover:bg-muted/20 transition-colors">
      <div className="pt-1.5 shrink-0">
        <span
          className={`block w-1.5 h-1.5 rounded-full ${post.published ? "bg-emerald-500" : "bg-muted-foreground/30"}`}
          title={post.published ? "Published" : "Draft"}
        />
      </div>

      <Link href={`/notes/${post.slug || post.id}`} className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
            {post.title}
          </span>
          <time className="text-xs font-mono text-muted-foreground shrink-0 tabular-nums">
            {date}
          </time>
        </div>
        {post.content && (
          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5 leading-relaxed">
            {post.content}
          </p>
        )}
      </Link>

      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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
    </div>
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
  onSaved: () => void;
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
      onSaved();
    } catch { setError("Network error"); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="border border-border/50 rounded-xl p-4 mb-4 bg-muted/10 space-y-3">
      {error && <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>}

      <input
        autoFocus
        type="text"
        value={title}
        onChange={(e) => { setTitle(e.target.value); if (!post) setSlug(autoSlug(e.target.value)); }}
        placeholder="Title"
        className="w-full px-3 py-2.5 bg-background border border-border/60 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/40 transition-colors"
        required
      />

      <input
        type="text"
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        placeholder="slug"
        className="w-full px-3 py-2 bg-background border border-border/60 rounded-lg text-xs font-mono text-muted-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/40 transition-colors"
      />

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Content (optional)"
        rows={4}
        className="w-full px-3 py-2.5 bg-background border border-border/60 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/40 transition-colors resize-none leading-relaxed"
      />

      {/* Tag selector — other tags still toggleable */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => {
            const sel = selectedTagIds.includes(tag.id);
            return (
              <button key={tag.id} type="button" onClick={() => toggleTag(tag.id)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${sel ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"}`}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: sel ? "currentColor" : tag.color }} />
                {tag.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <button type="button" role="switch" aria-checked={published} onClick={() => setPublished(!published)}
            className={`relative w-8 h-4 rounded-full transition-colors ${published ? "bg-emerald-500" : "bg-muted"}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${published ? "translate-x-4" : ""}`} />
          </button>
          <span className="text-xs text-muted-foreground">{published ? "Publish" : "Draft"}</span>
        </label>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
          <button type="submit" disabled={saving}
            className="px-4 py-1.5 bg-foreground text-background text-xs font-medium rounded-lg hover:opacity-80 disabled:opacity-40 transition-opacity"
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
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(tag?.name ?? "");
  const [color, setColor] = useState(tag?.color ?? "#6b9ac4");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await fetch(tag ? `/api/tags/${tag.id}` : "/api/tags", {
        method: tag ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), color }),
      });
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="border border-border/50 rounded-xl p-4 mb-6 bg-muted/10 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {tag ? "Edit tag" : "New tag"}
        </span>
        <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center gap-3">
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tag name"
          className="flex-1 px-3 py-2.5 bg-background border border-border/60 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/40 transition-colors"
          required
        />
        <div className="flex items-center gap-1.5">
          {PRESET_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)}
              className={`w-5 h-5 rounded-full transition-transform hover:scale-110 ${color === c ? "ring-2 ring-offset-2 ring-offset-background ring-foreground/40 scale-110" : ""}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
        <button type="submit" disabled={saving || !name.trim()}
          className="px-4 py-1.5 bg-foreground text-background text-xs font-medium rounded-lg hover:opacity-80 disabled:opacity-40 transition-opacity"
        >
          {saving ? "Saving..." : tag ? "Save" : "Create"}
        </button>
      </div>
    </form>
  );
}
