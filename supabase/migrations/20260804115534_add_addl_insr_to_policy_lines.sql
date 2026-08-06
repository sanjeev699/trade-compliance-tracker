ALTER TABLE public.policy_lines
  ADD COLUMN IF NOT EXISTS addl_insr boolean NOT NULL DEFAULT false;