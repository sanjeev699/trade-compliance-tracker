-- Add onboarding_status to vendors table
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS onboarding_status VARCHAR(50) DEFAULT 'INVITED';

-- Reload the PostgREST API schema cache so that the new column is immediately recognized by the Supabase client
NOTIFY pgrst, 'reload schema';
