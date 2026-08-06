require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fix() {
  const vendorId = 'd101c1e8-0d5a-42fd-9bf7-34598b979a42';
  
  // 1. Delete the corrupted hallucinated blank Auto line
  await supabase.from('policy_lines').delete().eq('policy_id', '8a02faba-6b5c-47d0-9faf-80ef16c22e75');
  console.log('Deleted corrupted Auto line');

  // 2. Reactivate the valid old Auto line
  await supabase.from('policy_lines').update({ is_active: true }).eq('policy_id', '8233c01d-eba5-4857-bb25-56828dae5f7c');
  console.log('Re-activated valid Auto line');

  // 3. Insert the missing CGL from document 2
  await supabase.from('policy_lines').insert({
    vendor_id: vendorId,
    document_id: '26eecf1f-4925-4964-8c64-c7608332ee9a',
    policy_number: 'GLP2101288',
    naic_code: '26344',
    coverage_type: 'GL',
    limit_amount: 1000000,
    effective_limit_amount: 1000000,
    effective_date: '2012-04-27',
    expiration_date: '2013-04-27',
    status: 'APPROVED',
    addl_insr: true,
    subr_wvd: true,
    is_active: true
  });
  console.log('Inserted missing CGL line');

  // 4. Insert the missing WC from document 2
  await supabase.from('policy_lines').insert({
    vendor_id: vendorId,
    document_id: '26eecf1f-4925-4964-8c64-c7608332ee9a',
    policy_number: 'DTJUB366K428013',
    naic_code: '25674',
    coverage_type: 'WORKERS_COMP',
    limit_amount: 1000000,
    effective_limit_amount: 1000000,
    effective_date: '2013-04-01',
    expiration_date: '2014-04-01',
    status: 'APPROVED',
    addl_insr: true,
    subr_wvd: true,
    is_active: true
  });
  console.log('Inserted missing WC line');
}

fix().then(() => console.log('Done')).catch(console.error);
