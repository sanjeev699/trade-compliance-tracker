const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.rpc('get_policies').then(res => {
  // if rpc doesn't exist, just query pg_policies
}).catch(console.error);

async function getPolicies() {
  const { data, error } = await supabase.from('pg_policies').select('*').eq('tablename', 'documents');
  console.log('Policies:', data || error);
}
// wait we can't query pg_policies directly from supabase client unless we use raw sql
// Let's use the REST API for pg_policies if it's exposed, usually it's not.
// Let's just create a quick migration file or run a postgres query directly using postgres driver.
