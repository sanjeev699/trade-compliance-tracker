require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing env vars', process.env);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function repair() {
  const { data: vendors } = await supabase.from('vendors').select('vendor_id');
  for (const v of vendors || []) {
    const { data: lines } = await supabase.from('policy_lines').select('*').eq('vendor_id', v.vendor_id).order('created_at', { ascending: false });
    
    const activePerType = new Map();
    for (const line of lines || []) {
      const isBlank = Number(line.limit_amount) === 0 && !line.effective_date && !line.expiration_date && line.policy_number === 'Unverified';
      
      if (isBlank) {
        console.log(`Deleting blank line ${line.policy_id} for ${v.vendor_id}`);
        await supabase.from('policy_lines').delete().eq('policy_id', line.policy_id);
      } else {
        if (!activePerType.has(line.coverage_type)) {
          activePerType.set(line.coverage_type, line.policy_id);
          if (!line.is_active) {
            console.log(`Re-activating line ${line.policy_id} for ${v.vendor_id}`);
            await supabase.from('policy_lines').update({ is_active: true }).eq('policy_id', line.policy_id);
          }
        }
      }
    }
  }
}

repair().then(() => console.log('Done')).catch(console.error);
