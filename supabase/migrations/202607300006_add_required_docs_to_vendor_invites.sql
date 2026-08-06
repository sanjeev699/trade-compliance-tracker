ALTER TABLE public.vendor_invites 
ADD COLUMN IF NOT EXISTS required_docs JSONB NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
