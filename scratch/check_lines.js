require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function check() {
  const { data: vendors } = await supabase.from('vendors').select('vendor_id, company_name');
  const vendor = vendors.find(v => v.company_name === 'Studio Test');
  if (!vendor) return console.log('Vendor not found');

  const { data: lines } = await supabase.from('policy_lines').select('*').eq('vendor_id', vendor.vendor_id).order('created_at', { ascending: false });
  console.log('POLICY LINES:', JSON.stringify(lines, null, 2));

  const { data: docs } = await supabase.from('documents').select('id, doc_type, extraction_status, review_queue_items').eq('vendor_id', vendor.vendor_id);
  console.log('DOCUMENTS:', JSON.stringify(docs, null, 2));
}

check().then(() => console.log('Done')).catch(console.error);
