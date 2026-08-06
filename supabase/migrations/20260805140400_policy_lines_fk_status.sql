-- Rename column and update foreign key constraint for cascade delete
ALTER TABLE public.policy_lines RENAME COLUMN source_document_id TO document_id;

-- Try to drop the default constraint name for source_document_id (if it exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'policy_lines_source_document_id_fkey'
        AND table_name = 'policy_lines'
    ) THEN
        ALTER TABLE public.policy_lines DROP CONSTRAINT policy_lines_source_document_id_fkey;
    END IF;
END $$;

-- If Supabase generated it differently (e.g. policy_lines_document_id_fkey after rename), try to drop that too
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'policy_lines_document_id_fkey'
        AND table_name = 'policy_lines'
    ) THEN
        ALTER TABLE public.policy_lines DROP CONSTRAINT policy_lines_document_id_fkey;
    END IF;
END $$;

-- Add the new cascade delete constraint
ALTER TABLE public.policy_lines
  ADD CONSTRAINT policy_lines_document_id_fkey
  FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;

-- Add granular status column
ALTER TABLE public.policy_lines
  ADD COLUMN status varchar(30) NOT NULL DEFAULT 'APPROVED',
  ADD CONSTRAINT policy_lines_status_check CHECK (status IN ('APPROVED', 'EXPIRED', 'REJECTED', 'MISSING_DATA'));
