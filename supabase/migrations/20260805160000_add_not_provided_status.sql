ALTER TABLE public.policy_lines DROP CONSTRAINT IF EXISTS policy_lines_status_check;
ALTER TABLE public.policy_lines ADD CONSTRAINT policy_lines_status_check CHECK (status IN ('APPROVED', 'EXPIRED', 'REJECTED', 'MISSING_DATA', 'NOT_PROVIDED'));
