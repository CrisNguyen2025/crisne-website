// ---------------------------------------------------------------------------
// Favorites domain types (separate from tags for multi-user support)
// ---------------------------------------------------------------------------

export interface FavoriteTag {
  tagId: string;
  userId?: string; // For future multi-user support
  createdAt: string; // ISO 8601
}

export interface FavoritesResponse {
  favorites: string[]; // Array of tag IDs
}
