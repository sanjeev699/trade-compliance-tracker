ALTER TABLE public.policy_lines
  ADD COLUMN IF NOT EXISTS addl_insr boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subr_wvd boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS employers_liability_ea_acc numeric(12,2),
  ADD COLUMN IF NOT EXISTS employers_liability_disease_ea_emp numeric(12,2),
  ADD COLUMN IF NOT EXISTS employers_liability_disease_policy_limit numeric(12,2);
