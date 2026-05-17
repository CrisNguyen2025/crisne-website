import { Client, isFullPage } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import type { NotionPost, NotionTag } from "./notion-types";

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

export const POSTS_DB_ID = process.env.NOTION_POSTS_DB_ID!;
export const TAGS_DB_ID = process.env.NOTION_TAGS_DB_ID!;

// ---------------------------------------------------------------------------
// Property helpers
// ---------------------------------------------------------------------------

function getProp(page: PageObjectResponse, key: string) {
  return page.properties[key];
}

function richTextToString(prop: ReturnType<typeof getProp>): string {
  if (!prop || prop.type !== "rich_text") return "";
  return prop.rich_text.map((t) => t.plain_text).join("");
}

function titleToString(prop: ReturnType<typeof getProp>): string {
  if (!prop || prop.type !== "title") return "";
  return prop.title.map((t) => t.plain_text).join("");
}

function checkboxToBool(prop: ReturnType<typeof getProp>): boolean {
  if (!prop || prop.type !== "checkbox") return false;
  return prop.checkbox;
}

function relationToIds(prop: ReturnType<typeof getProp>): string[] {
  if (!prop || prop.type !== "relation") return [];
  return prop.relation.map((r) => r.id);
}

// ---------------------------------------------------------------------------
// Query helper — SDK v5 removed databases.query, use search() instead
// ---------------------------------------------------------------------------

async function queryDatabase(
  databaseId: string,
  opts?: {
    filter?: Record<string, unknown>;
    sorts?: { timestamp: "created_time" | "last_edited_time"; direction: "ascending" | "descending" }[];
  }
): Promise<PageObjectResponse[]> {
  const results: PageObjectResponse[] = [];
  let cursor: string | undefined;

  do {
    const res = await notion.search({
      filter: { property: "object", value: "page" },
      ...(cursor ? { start_cursor: cursor } : {}),
    });

    for (const page of res.results) {
      if (!isFullPage(page)) continue;

      // SDK v5: parent can be type "database_id" OR "data_source_id"
      const parent = page.parent as Record<string, unknown>;
      const parentDbId =
        (parent["database_id"] as string | undefined) ??
        (parent["data_source_id"] as string | undefined);

      if (!parentDbId || normalizeId(parentDbId) !== normalizeId(databaseId)) continue;

      // Apply optional filter
      if (opts?.filter && !matchFilter(page, opts.filter)) continue;

      results.push(page);
    }

    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);

  // Sort client-side
  if (opts?.sorts?.length) {
    const { timestamp, direction } = opts.sorts[0];
    results.sort((a, b) => {
      const aVal = timestamp === "created_time" ? a.created_time : a.last_edited_time;
      const bVal = timestamp === "created_time" ? b.created_time : b.last_edited_time;
      return direction === "ascending"
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    });
  }

  return results;
}

/** Normalize Notion IDs — strip dashes for comparison */
function normalizeId(id: string): string {
  return id.replace(/-/g, "");
}

/** Simple client-side filter matching for common Notion filter shapes */
function matchFilter(page: PageObjectResponse, filter: Record<string, unknown>): boolean {
  // { and: [...] }
  if (Array.isArray(filter["and"])) {
    return (filter["and"] as Record<string, unknown>[]).every((f) => matchFilter(page, f));
  }
  // { or: [...] }
  if (Array.isArray(filter["or"])) {
    return (filter["or"] as Record<string, unknown>[]).some((f) => matchFilter(page, f));
  }

  const property = filter["property"] as string | undefined;
  if (!property) return true;

  const prop = page.properties[property];
  if (!prop) return false;

  // checkbox: { equals: boolean }
  if (filter["checkbox"] && prop.type === "checkbox") {
    const { equals } = filter["checkbox"] as { equals: boolean };
    return prop.checkbox === equals;
  }

  // relation: { contains: string }
  if (filter["relation"] && prop.type === "relation") {
    const { contains } = filter["relation"] as { contains: string };
    return prop.relation.some((r) => normalizeId(r.id) === normalizeId(contains));
  }

  // rich_text: { equals: string }
  if (filter["rich_text"] && prop.type === "rich_text") {
    const { equals } = filter["rich_text"] as { equals: string };
    const val = prop.rich_text.map((t) => t.plain_text).join("");
    return val === equals;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

export function mapTag(page: PageObjectResponse): NotionTag {
  return {
    id: page.id,
    name: titleToString(getProp(page, "Name")),
    color: richTextToString(getProp(page, "Color")) || "#6b9ac4",
    postIds: relationToIds(getProp(page, "Posts")),
    createdAt: page.created_time,
  };
}

export function mapPost(page: PageObjectResponse): NotionPost {
  return {
    id: page.id,
    title: titleToString(getProp(page, "Title")),
    slug: richTextToString(getProp(page, "Slug")),
    content: richTextToString(getProp(page, "Content")),
    published: checkboxToBool(getProp(page, "Published")),
    tagIds: relationToIds(getProp(page, "Tags")),
    createdAt: page.created_time,
    updatedAt: page.last_edited_time,
  };
}

// ---------------------------------------------------------------------------
// TAG CRUD
// ---------------------------------------------------------------------------

export async function getTags(): Promise<NotionTag[]> {
  const pages = await queryDatabase(TAGS_DB_ID, {
    sorts: [{ timestamp: "created_time", direction: "ascending" }],
  });
  return pages.map(mapTag);
}

export async function getTagById(id: string): Promise<NotionTag | null> {
  const page = await notion.pages.retrieve({ page_id: id });
  if (!isFullPage(page)) return null;
  return mapTag(page);
}

export async function createTag(name: string, color = "#6b9ac4"): Promise<NotionTag> {
  const page = await notion.pages.create({
    parent: { database_id: TAGS_DB_ID },
    properties: {
      Name: { title: [{ text: { content: name } }] },
      Color: { rich_text: [{ text: { content: color } }] },
    },
  });
  if (!isFullPage(page)) throw new Error("Unexpected partial page response");
  return mapTag(page);
}

export async function updateTag(
  id: string,
  data: { name?: string; color?: string }
): Promise<NotionTag> {
  const properties: Record<string, unknown> = {};
  if (data.name !== undefined)
    properties["Name"] = { title: [{ text: { content: data.name } }] };
  if (data.color !== undefined)
    properties["Color"] = { rich_text: [{ text: { content: data.color } }] };

  const page = await notion.pages.update({ page_id: id, properties });
  if (!isFullPage(page)) throw new Error("Unexpected partial page response");
  return mapTag(page);
}

export async function deleteTag(id: string): Promise<void> {
  await notion.pages.update({ page_id: id, archived: true });
}

// ---------------------------------------------------------------------------
// POST CRUD
// ---------------------------------------------------------------------------

export async function getPosts(opts?: {
  tagId?: string;
  publishedOnly?: boolean;
}): Promise<NotionPost[]> {
  const filters: Record<string, unknown>[] = [];

  if (opts?.publishedOnly) {
    filters.push({ property: "Published", checkbox: { equals: true } });
  }
  if (opts?.tagId) {
    filters.push({ property: "Tags", relation: { contains: opts.tagId } });
  }

  const filter =
    filters.length === 0
      ? undefined
      : filters.length === 1
        ? filters[0]
        : { and: filters };

  const pages = await queryDatabase(POSTS_DB_ID, {
    filter,
    sorts: [{ timestamp: "created_time", direction: "descending" }],
  });

  return pages.map(mapPost);
}

export async function getPostById(id: string): Promise<NotionPost | null> {
  const page = await notion.pages.retrieve({ page_id: id });
  if (!isFullPage(page)) return null;
  return mapPost(page);
}

export async function getPostBySlug(slug: string): Promise<NotionPost | null> {
  const pages = await queryDatabase(POSTS_DB_ID, {
    filter: { property: "Slug", rich_text: { equals: slug } },
  });
  return pages[0] ? mapPost(pages[0]) : null;
}

export async function createPost(data: {
  title: string;
  slug?: string;
  content?: string;
  published?: boolean;
  tagIds?: string[];
}): Promise<NotionPost> {
  const page = await notion.pages.create({
    parent: { database_id: POSTS_DB_ID },
    properties: {
      Title: { title: [{ text: { content: data.title } }] },
      Slug: { rich_text: [{ text: { content: data.slug ?? slugify(data.title) } }] },
      Content: { rich_text: [{ text: { content: data.content ?? "" } }] },
      Published: { checkbox: data.published ?? false },
      Tags: { relation: (data.tagIds ?? []).map((id) => ({ id })) },
    },
  });
  if (!isFullPage(page)) throw new Error("Unexpected partial page response");
  return mapPost(page);
}

export async function updatePost(
  id: string,
  data: {
    title?: string;
    slug?: string;
    content?: string;
    published?: boolean;
    tagIds?: string[];
  }
): Promise<NotionPost> {
  const properties: Record<string, unknown> = {};
  if (data.title !== undefined)
    properties["Title"] = { title: [{ text: { content: data.title } }] };
  if (data.slug !== undefined)
    properties["Slug"] = { rich_text: [{ text: { content: data.slug } }] };
  if (data.content !== undefined)
    properties["Content"] = { rich_text: [{ text: { content: data.content } }] };
  if (data.published !== undefined)
    properties["Published"] = { checkbox: data.published };
  if (data.tagIds !== undefined)
    properties["Tags"] = { relation: data.tagIds.map((tid) => ({ id: tid })) };

  const page = await notion.pages.update({ page_id: id, properties });
  if (!isFullPage(page)) throw new Error("Unexpected partial page response");
  return mapPost(page);
}

export async function deletePost(id: string): Promise<void> {
  await notion.pages.update({ page_id: id, archived: true });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
