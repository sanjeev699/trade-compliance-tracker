-- Add VERIFIED to the documents extraction_status constraint
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_extraction_status_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_extraction_status_check check (
    extraction_status in ('PENDING', 'EXTRACTED', 'PROCESSED', 'VERIFIED', 'REVIEW_REQUIRED', 'FAILED')
);
