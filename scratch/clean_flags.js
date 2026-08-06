require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function cleanFlags() {
  const vendorId = 'd101c1e8-0d5a-42fd-9bf7-34598b979a42';
  
  // Delete the stale POLICY_CONFLICT flags
  const { data, error } = await supabase
    .from('review_queue_items')
    .delete()
    .eq('vendor_id', vendorId)
    .eq('review_type', 'POLICY_CONFLICT');
    
  if (error) {
    console.error('Error deleting flags:', error);
  } else {
    console.log('Successfully deleted stale POLICY_CONFLICT flags for vendor.');
  }
}

cleanFlags().then(() => console.log('Done')).catch(console.error);
