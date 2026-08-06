-- 1. Create organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    logo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Add organization_id to vendors
ALTER TABLE public.vendors 
ADD COLUMN IF NOT EXISTS organization_id VARCHAR(50) REFERENCES public.organizations(id) ON DELETE SET NULL;

-- 3. Add organization_id to vendor_invites
ALTER TABLE public.vendor_invites
ADD COLUMN IF NOT EXISTS organization_id VARCHAR(50) REFERENCES public.organizations(id) ON DELETE SET NULL;

-- 4. Add metadata JSONB column to vendors
ALTER TABLE public.vendors
ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 5. Seed default GC record
INSERT INTO public.organizations (id, name, logo_url)
VALUES ('00000000-0000-0000-0000-000000000001', 'Meridian Construction Group', null)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, logo_url = EXCLUDED.logo_url;

-- 6. Backfill existing records
UPDATE public.vendors SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;
UPDATE public.vendor_invites SET organization_id = '00000000-0000-0000-0000-000000000001' WHERE organization_id IS NULL;

NOTIFY pgrst, 'reload schema';
