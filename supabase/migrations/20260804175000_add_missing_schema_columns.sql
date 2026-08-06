-- 1. Add sc_id to vendors
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS sc_id VARCHAR(50);

-- 2. Create the audit_logs table (it was completely missing)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID REFERENCES public.vendors(vendor_id) ON DELETE CASCADE,
    actor_name VARCHAR(255),
    actor_role VARCHAR(100),
    action_type VARCHAR(100) NOT NULL,
    action_details TEXT,
    user_email VARCHAR(255),
    manager_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Add notes to review_queue_items
ALTER TABLE public.review_queue_items
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- 4. Update the review_queue_items_type_check constraint to explicitly include MANUAL_OVERRIDE if missing
ALTER TABLE public.review_queue_items DROP CONSTRAINT IF EXISTS review_queue_items_type_check;
ALTER TABLE public.review_queue_items ADD CONSTRAINT review_queue_items_type_check CHECK (
  review_type IN ('LOW_CONFIDENCE_MATCH', 'ADDRESS_MISMATCH', 'CARRIER_SWITCH', 'POLICY_CONFLICT', 'MISSING_POLICY_DATA', 'MANUAL_OVERRIDE', 'INVALID_DOCUMENT_FORMAT', 'ENTITY_MISMATCH')
);
