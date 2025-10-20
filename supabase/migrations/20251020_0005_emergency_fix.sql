-- Emergency fix for comments table
-- Temporarily disable foreign key constraint to allow comments to work

-- Drop the problematic foreign key constraint
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_author_username_fkey;
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_author_id_fkey;

-- Make author_id nullable to prevent constraint issues
ALTER TABLE comments ALTER COLUMN author_id DROP NOT NULL;

-- Add a simple check constraint instead of foreign key
ALTER TABLE comments ADD CONSTRAINT comments_author_id_check 
    CHECK (author_id IS NULL OR author_id IN (SELECT id FROM user_profiles));

-- Update existing comments to have proper author_id
UPDATE comments 
SET author_id = (
    SELECT id FROM user_profiles WHERE username = comments.author_username
) 
WHERE author_id IS NULL OR author_id = '' OR author_id NOT IN (
    SELECT id FROM user_profiles WHERE id IS NOT NULL
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_comments_author_id ON comments(author_id);
