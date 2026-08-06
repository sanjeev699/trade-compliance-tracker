-- Set existing fully onboarded vendors to APPROVED so they aren't stuck in INVITED state
UPDATE public.vendors
SET onboarding_status = 'APPROVED'
WHERE EXISTS (
    SELECT 1 FROM public.policy_lines 
    WHERE policy_lines.vendor_id = vendors.vendor_id
)
OR created_at < NOW() - INTERVAL '1 day';

-- For good measure, ensure the schema cache is fresh
NOTIFY pgrst, 'reload schema';
