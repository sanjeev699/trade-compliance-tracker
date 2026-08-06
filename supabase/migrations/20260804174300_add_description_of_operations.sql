ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS description_of_operations text;
