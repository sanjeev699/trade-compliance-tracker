-- Add rejection_reason column to policy_lines table
ALTER TABLE public.policy_lines ADD COLUMN rejection_reason text;
