-- Direct fix for comments table foreign key constraint
-- This migration handles the case where previous migrations may have failed

-- First, check if the constraint exists and drop it
DO $$
BEGIN
    -- Drop existing foreign key constraint if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'comments_author_username_fkey' 
        AND table_name = 'comments'
    ) THEN
        ALTER TABLE comments DROP CONSTRAINT comments_author_username_fkey;
    END IF;
END $$;

-- Add new foreign key constraint on author_id if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'comments_author_id_fkey' 
        AND table_name = 'comments'
    ) THEN
        ALTER TABLE comments ADD CONSTRAINT comments_author_id_fkey 
            FOREIGN KEY (author_id) REFERENCES user_profiles(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Update existing comments to use proper author_id
UPDATE comments 
SET author_id = (
    SELECT id FROM user_profiles WHERE username = comments.author_username
) 
WHERE author_id IS NULL OR author_id = '' OR author_id NOT IN (
    SELECT id FROM user_profiles
);

-- Create index if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_comments_author_id ON comments(author_id);
