import { Client, isFullPage } from "@notionhq/client";
import type {
  PageObjectResponse,
  UpdatePageParameters,
} from "@notionhq/client/build/src/api-endpoints";
import type { NotionPost, NotionTag } from "./notion-types";

type NotionProperties = UpdatePageParameters["properties"];

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

export const POSTS_DB_ID = process.env.NOTION_POSTS_DB_ID!;
export const TAGS_DB_ID = process.env.NOTION_TAGS_DB_ID!;
export const FAVORITES_DB_ID = process.env.NOTION_FAVORITES_DB_ID!;

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

/** Notion rich_text blocks are limited to 2000 chars each. Split long strings. */
const NOTION_TEXT_LIMIT = 2000;
const NOTION_BLOCKS_LIMIT = 100; // Notion limit for rich_text array

function toRichTextBlocks(text: string): { text: { content: string } }[] {
  if (!text) return [{ text: { content: "" } }];
  const blocks: { text: { content: string } }[] = [];
  for (let i = 0; i < text.length; i += NOTION_TEXT_LIMIT) {
    blocks.push({ text: { content: text.slice(i, i + NOTION_TEXT_LIMIT) } });
  }
  
  // Warn if exceeding Notion's limit
  if (blocks.length > NOTION_BLOCKS_LIMIT) {
    console.warn(
      `Content is too large (${blocks.length} blocks). Notion limit is ${NOTION_BLOCKS_LIMIT} blocks. ` +
      `Content will be truncated. Consider using external image hosting.`
    );
    return blocks.slice(0, NOTION_BLOCKS_LIMIT);
  }
  
  return blocks;
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

  // SDK v5 (Notion-Version 2025-09-03) removed databases.query endpoint.
  // Must use dataSources.query with the data_source_id instead.
  const dataSourceId = await resolveDataSourceId(databaseId);

  const sorts = opts?.sorts?.map((s) => ({
    timestamp: s.timestamp as "created_time" | "last_edited_time",
    direction: s.direction as "ascending" | "descending",
  }));

  do {
    const res = await (notion.dataSources as any).query({
      data_source_id: dataSourceId,
      ...(opts?.filter ? { filter: opts.filter } : {}),
      ...(sorts?.length ? { sorts } : {}),
      ...(cursor ? { start_cursor: cursor } : {}),
      page_size: 100,
    });

    for (const page of res.results) {
      if (!isFullPage(page)) continue;
      results.push(page);
    }

    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return results;
}

// Cache: database_id → data_source_id (first data source)
const dataSourceIdCache = new Map<string, string>();

async function resolveDataSourceId(databaseId: string): Promise<string> {
  const cached = dataSourceIdCache.get(databaseId);
  if (cached) return cached;

  const db = await notion.databases.retrieve({ database_id: databaseId }) as any;
  const dataSources: { id: string; name: string }[] = db.data_sources ?? [];
  if (!dataSources.length) {
    throw new Error(`No data sources found for database ${databaseId}`);
  }
  const dsId = dataSources[0].id;
  dataSourceIdCache.set(databaseId, dsId);
  return dsId;
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

  // title: { equals: string }
  if (filter["title"] && prop.type === "title") {
    const { equals } = filter["title"] as { equals: string };
    const val = prop.title.map((t) => t.plain_text).join("");
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
  const properties: NotionProperties = {};
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
  const properties: NotionProperties = {
    Title: { title: [{ text: { content: data.title } }] },
    Slug: { rich_text: [{ text: { content: data.slug ?? slugify(data.title) } }] },
    Content: { rich_text: toRichTextBlocks(data.content ?? "") },
    Tags: { relation: (data.tagIds ?? []).map((id) => ({ id })) },
  };

  const page = await notion.pages.create({
    parent: { database_id: POSTS_DB_ID },
    properties,
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
  const properties: NotionProperties = {};
  if (data.title !== undefined)
    properties["Title"] = { title: [{ text: { content: data.title } }] };
  if (data.slug !== undefined)
    properties["Slug"] = { rich_text: [{ text: { content: data.slug } }] };
  if (data.content !== undefined)
    properties["Content"] = { rich_text: toRichTextBlocks(data.content) };
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

// ---------------------------------------------------------------------------
// FAVORITES CRUD
// ---------------------------------------------------------------------------

export interface NotionFavorite {
  id: string;
  userId: string;
  tagId: string;
  createdAt: string;
}

function mapFavorite(page: PageObjectResponse): NotionFavorite {
  return {
    id: page.id,
    userId: titleToString(getProp(page, "UserId")), // UserId is Title field
    tagId: richTextToString(getProp(page, "TagId")),
    createdAt: page.created_time,
  };
}

export async function getFavorites(userId: string): Promise<string[]> {
  const pages = await queryDatabase(FAVORITES_DB_ID, {
    filter: { property: "UserId", title: { equals: userId } }, // Changed to title
  });
  return pages.map(page => richTextToString(getProp(page, "TagId")));
}

export async function addFavorite(userId: string, tagId: string): Promise<NotionFavorite> {
  // Check if already exists
  const existing = await queryDatabase(FAVORITES_DB_ID, {
    filter: {
      and: [
        { property: "UserId", title: { equals: userId } }, // Changed to title
        { property: "TagId", rich_text: { equals: tagId } },
      ],
    },
  });

  if (existing.length > 0) {
    return mapFavorite(existing[0]);
  }

  // Create new
  const page = await notion.pages.create({
    parent: { database_id: FAVORITES_DB_ID },
    properties: {
      UserId: { title: [{ text: { content: userId } }] }, // Changed to title
      TagId: { rich_text: [{ text: { content: tagId } }] },
    },
  });

  if (!isFullPage(page)) throw new Error("Unexpected partial page response");
  return mapFavorite(page);
}

export async function removeFavorite(userId: string, tagId: string): Promise<void> {
  const pages = await queryDatabase(FAVORITES_DB_ID, {
    filter: {
      and: [
        { property: "UserId", title: { equals: userId } }, // Changed to title
        { property: "TagId", rich_text: { equals: tagId } },
      ],
    },
  });

  for (const page of pages) {
    await notion.pages.update({ page_id: page.id, archived: true });
  }
}
