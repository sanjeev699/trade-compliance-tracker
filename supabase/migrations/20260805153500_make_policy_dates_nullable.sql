-- Make effective_date and expiration_date nullable on policy_lines
ALTER TABLE public.policy_lines
  ALTER COLUMN effective_date DROP NOT NULL,
  ALTER COLUMN expiration_date DROP NOT NULL;
