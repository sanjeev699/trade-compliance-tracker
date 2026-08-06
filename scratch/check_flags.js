require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkFlags() {
  const vendorId = 'd101c1e8-0d5a-42fd-9bf7-34598b979a42';
  
  const { data: flags } = await supabase
    .from('review_queue_items')
    .select('*')
    .eq('vendor_id', vendorId);
    
  console.log('FLAGS:', JSON.stringify(flags, null, 2));
}

checkFlags().then(() => console.log('Done')).catch(console.error);
