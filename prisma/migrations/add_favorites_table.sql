-- Migration: Add Favorites System
-- Description: Create favorites table with proper indexes and triggers
-- Date: 2026-05-25

-- ============================================================================
-- 1. Create favorites table
-- ============================================================================
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tag_id UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Ensure one user can only favorite a tag once
  CONSTRAINT unique_user_tag UNIQUE(user_id, tag_id),
  
  -- Foreign keys (uncomment when users table exists)
  -- CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  -- CONSTRAINT fk_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- ============================================================================
-- 2. Create indexes for fast lookup
-- ============================================================================

-- Composite index for checking if user favorited a tag (O(1) lookup)
CREATE INDEX IF NOT EXISTS idx_favorites_user_tag 
ON favorites(user_id, tag_id);

-- Index for getting all favorites of a user
CREATE INDEX IF NOT EXISTS idx_favorites_user 
ON favorites(user_id);

-- Index for getting all users who favorited a tag
CREATE INDEX IF NOT EXISTS idx_favorites_tag 
ON favorites(tag_id);

-- Index for sorting by created_at
CREATE INDEX IF NOT EXISTS idx_favorites_created 
ON favorites(created_at DESC);

-- ============================================================================
-- 3. Add favorite_count to tags table (cached count)
-- ============================================================================

-- Add column if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tags' AND column_name = 'favorite_count'
  ) THEN
    ALTER TABLE tags ADD COLUMN favorite_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- Create index on favorite_count for sorting
CREATE INDEX IF NOT EXISTS idx_tags_favorite_count 
ON tags(favorite_count DESC);

-- ============================================================================
-- 4. Create trigger to auto-update favorite_count
-- ============================================================================

-- Function to update favorite_count
CREATE OR REPLACE FUNCTION update_tag_favorite_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Increment count when favorite added
    UPDATE tags 
    SET favorite_count = favorite_count + 1 
    WHERE id = NEW.tag_id;
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    -- Decrement count when favorite removed
    UPDATE tags 
    SET favorite_count = GREATEST(favorite_count - 1, 0)
    WHERE id = OLD.tag_id;
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_favorite_count ON favorites;
CREATE TRIGGER trigger_update_favorite_count
AFTER INSERT OR DELETE ON favorites
FOR EACH ROW 
EXECUTE FUNCTION update_tag_favorite_count();

-- ============================================================================
-- 5. Initialize favorite_count for existing tags
-- ============================================================================

-- Update favorite_count based on existing favorites
UPDATE tags
SET favorite_count = (
  SELECT COUNT(*) 
  FROM favorites 
  WHERE favorites.tag_id = tags.id
);

-- ============================================================================
-- 6. Add helpful comments
-- ============================================================================

COMMENT ON TABLE favorites IS 'Stores user favorite tags with optimized indexes';
COMMENT ON COLUMN favorites.user_id IS 'User who favorited the tag';
COMMENT ON COLUMN favorites.tag_id IS 'Tag that was favorited';
COMMENT ON COLUMN favorites.created_at IS 'When the favorite was created';
COMMENT ON COLUMN tags.favorite_count IS 'Cached count of favorites (auto-updated by trigger)';

-- ============================================================================
-- 7. Create helper views (optional)
-- ============================================================================

-- View: Popular tags by favorite count
CREATE OR REPLACE VIEW popular_tags AS
SELECT 
  t.*,
  t.favorite_count
FROM tags t
WHERE t.favorite_count > 0
ORDER BY t.favorite_count DESC, t.name ASC;

-- View: Recent favorites
CREATE OR REPLACE VIEW recent_favorites AS
SELECT 
  f.*,
  t.name as tag_name,
  t.color as tag_color
FROM favorites f
JOIN tags t ON f.tag_id = t.id
ORDER BY f.created_at DESC;

-- ============================================================================
-- 8. Grant permissions (adjust as needed)
-- ============================================================================

-- GRANT SELECT, INSERT, DELETE ON favorites TO your_app_user;
-- GRANT SELECT, UPDATE ON tags TO your_app_user;

-- ============================================================================
-- Done!
-- ============================================================================

-- Verify migration
SELECT 
  'favorites table' as object,
  COUNT(*) as row_count 
FROM favorites
UNION ALL
SELECT 
  'tags with favorites' as object,
  COUNT(*) as row_count 
FROM tags 
WHERE favorite_count > 0;
