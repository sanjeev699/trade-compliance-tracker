require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function check() {
  const vendorId = 'd101c1e8-0d5a-42fd-9bf7-34598b979a42';
  
  const { data: lines } = await supabase.from('policy_lines').select('*').eq('vendor_id', vendorId).order('created_at', { ascending: false });
  console.log('POLICY LINES:', JSON.stringify(lines, null, 2));

  const { data: docs } = await supabase.from('documents').select('*').eq('vendor_id', vendorId);
  console.log('DOCUMENTS:', JSON.stringify(docs, null, 2));
}

check().then(() => console.log('Done')).catch(console.error);
