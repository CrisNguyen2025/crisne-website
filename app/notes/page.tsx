import { getPosts, getTags } from "@/lib/notion";
import type { PostWithTags, TagWithPostCount } from "@/lib/notion-types";
import { NotesClient } from "./NotesClient";

export const revalidate = 0;

export default async function NotesPage() {
  const [rawPosts, rawTags] = await Promise.all([
    getPosts(),
    getTags(),
  ]);

  const tagMap = Object.fromEntries(rawTags.map((t) => [t.id, t]));

  const posts: PostWithTags[] = rawPosts.map(({ tagIds, ...post }) => ({
    ...post,
    tags: tagIds.flatMap((id) => (tagMap[id] ? [tagMap[id]] : [])),
  }));

  const tags: TagWithPostCount[] = rawTags.map((t) => ({
    ...t,
    postCount: t.postIds.length,
  }));

  return <NotesClient initialPosts={posts} initialTags={tags} />;
}
