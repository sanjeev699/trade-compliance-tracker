-- PRD 5.2 Tab 2: the Risk Manager's resolution of a queue item has to be
-- auditable, so the outcome code and note live on the item itself.
alter table public.review_queue_items
  add column if not exists resolution_code varchar(50),
  add column if not exists resolution_notes text;

-- A rejected certificate is neither pending nor successfully processed.
alter table public.documents
  drop constraint if exists documents_extraction_status_check;

alter table public.documents
  add constraint documents_extraction_status_check check (
    extraction_status in ('PENDING', 'EXTRACTED', 'PROCESSED', 'REVIEW_REQUIRED', 'FAILED', 'REJECTED')
  );
