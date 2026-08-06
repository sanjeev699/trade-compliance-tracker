-- 1. Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('certificates', 'certificates', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Drop existing policies to avoid conflicts if they exist (optional but safe)
DROP POLICY IF EXISTS "Public Read Access certificates" ON storage.objects;
DROP POLICY IF EXISTS "Public Insert Access certificates" ON storage.objects;

-- 3. Create SELECT policy allowing anyone to view documents
CREATE POLICY "Public Read Access certificates" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'certificates');

-- 4. Create INSERT policy allowing anyone (anon or authenticated) to upload
CREATE POLICY "Public Insert Access certificates" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'certificates');
