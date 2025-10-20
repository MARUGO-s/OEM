-- Fix comments table foreign key constraint
-- Change author_username reference to author_id reference

-- Drop the existing foreign key constraint
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_author_username_fkey;

-- Add new foreign key constraint on author_id
ALTER TABLE comments ADD CONSTRAINT comments_author_id_fkey 
    FOREIGN KEY (author_id) REFERENCES user_profiles(id) ON DELETE SET NULL;

-- Drop the old index and create new one
DROP INDEX IF EXISTS idx_comments_author_username;
CREATE INDEX IF NOT EXISTS idx_comments_author_id ON comments(author_id);

-- Update existing comments to use proper author_id
UPDATE comments SET author_id = (
    SELECT id FROM user_profiles WHERE username = comments.author_username
) WHERE author_id IS NULL OR author_id = '';

-- Remove the author_username column constraint (it's now just a display field)
-- Note: We keep the column for display purposes but remove the foreign key constraint
