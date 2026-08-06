-- Create vendor_invites table if it doesn't exist (ensuring all needed columns for API)
CREATE TABLE IF NOT EXISTS public.vendor_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES public.vendors(vendor_id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    required_docs JSONB NOT NULL DEFAULT '[]'::jsonb,
    internal_note TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_vendor_invites_token ON public.vendor_invites(token);

NOTIFY pgrst, 'reload schema';
