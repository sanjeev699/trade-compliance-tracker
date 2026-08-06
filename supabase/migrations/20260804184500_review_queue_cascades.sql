-- 1. Clean up existing orphan records
DELETE FROM public.review_queue_items WHERE vendor_id IS NULL;

-- 2. Drop the existing foreign key constraint for vendor_id on review_queue_items
ALTER TABLE public.review_queue_items
  DROP CONSTRAINT IF EXISTS review_queue_items_vendor_id_fkey;

-- 3. Add the new constraint with ON DELETE CASCADE
ALTER TABLE public.review_queue_items
  ADD CONSTRAINT review_queue_items_vendor_id_fkey
  FOREIGN KEY (vendor_id) REFERENCES public.vendors(vendor_id) ON DELETE CASCADE;
