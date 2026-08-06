ALTER TABLE public.vendor_invites 
ADD COLUMN IF NOT EXISTS internal_note TEXT;

NOTIFY pgrst, 'reload schema';
