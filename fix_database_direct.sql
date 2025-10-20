-- Direct database fix to resolve foreign key constraint issues
-- This script will be executed directly on the Supabase database

-- 1. Check current constraints
SELECT 
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_name = 'comments';

-- 2. Drop existing problematic constraint
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_author_username_fkey;

-- 3. Add correct foreign key constraint
ALTER TABLE comments ADD CONSTRAINT comments_author_id_fkey 
    FOREIGN KEY (author_id) REFERENCES user_profiles(id) ON DELETE SET NULL;

-- 4. Update existing comments to have proper author_id
UPDATE comments 
SET author_id = (
    SELECT id FROM user_profiles WHERE username = comments.author_username
) 
WHERE author_id IS NULL OR author_id = '' OR author_id NOT IN (
    SELECT id FROM user_profiles WHERE id IS NOT NULL
);

-- 5. Create proper index
CREATE INDEX IF NOT EXISTS idx_comments_author_id ON comments(author_id);

-- 6. Verify the fix
SELECT 
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_name = 'comments';
