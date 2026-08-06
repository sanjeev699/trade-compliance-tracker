-- Cleanup orphaned policy lines from legacy parsers
-- These are policy lines that were saved to the vendor before the strict document_id requirement was added
DELETE FROM public.policy_lines WHERE document_id IS NULL;
