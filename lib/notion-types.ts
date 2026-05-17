// ---------------------------------------------------------------------------
// Notion-backed domain types
// ---------------------------------------------------------------------------

export interface NotionTag {
  id: string;       // Notion page ID
  name: string;
  color: string;    // hex or Notion color name
  postIds: string[]; // relation IDs (populated by Notion)
  createdAt: string; // ISO 8601
}

export interface NotionPost {
  id: string;        // Notion page ID
  title: string;
  slug: string;
  content: string;   // plain text (Notion rich_text property)
  published: boolean;
  tagIds: string[];  // relation IDs → resolve with getTags()
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// API response shapes (tags populated inline)
// ---------------------------------------------------------------------------

export interface PostWithTags extends Omit<NotionPost, "tagIds"> {
  tags: NotionTag[];
}

export interface TagWithPostCount extends NotionTag {
  postCount: number;
}
