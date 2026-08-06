-- Add new contact fields for the Subcontractor Onboarding Portal
ALTER TABLE public.vendors
ADD COLUMN IF NOT EXISTS primary_contact_name varchar(255),
ADD COLUMN IF NOT EXISTS alt_email varchar(255),
ADD COLUMN IF NOT EXISTS alt_phone varchar(50);
