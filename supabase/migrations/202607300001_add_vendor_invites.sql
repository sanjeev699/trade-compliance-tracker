-- Add onboarding_status to vendors table
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS onboarding_status varchar(50) DEFAULT 'INVITED';

-- Create vendor_invites table
CREATE TABLE IF NOT EXISTS public.vendor_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(vendor_id) ON DELETE CASCADE,
  token uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  required_docs jsonb NOT NULL DEFAULT '[]'::jsonb,
  internal_note text,
  expires_at timestamptz NOT NULL,
  status varchar(50) NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT current_timestamp,
  CONSTRAINT vendor_invites_status_check CHECK (status IN ('PENDING', 'USED', 'EXPIRED'))
);

-- Index for quick token lookups
CREATE INDEX IF NOT EXISTS vendor_invites_token_idx ON public.vendor_invites (token);

-- RLS
ALTER TABLE public.vendor_invites ENABLE ROW LEVEL SECURITY;
