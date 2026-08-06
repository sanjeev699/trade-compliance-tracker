const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function testAll() {
  const tableCols = {
    vendors: ['vendor_id', 'company_name', 'normalized_name', 'tax_id_ein', 'primary_email', 'trade_specialty', 'address_street', 'address_zip', 'emr_score', 'emr_verified', 'osha_file_url', 'created_at', 'updated_at'],
    projects: ['project_id', 'project_name', 'gatekeeper_access_token', 'req_gl_limit', 'req_umbrella_limit', 'created_at', 'updated_at'],
    project_lineups: ['lineup_id', 'project_id', 'vendor_id', 'override_status', 'created_at', 'updated_at'],
    policy_lines: ['policy_id', 'vendor_id', 'source_document_id', 'policy_number', 'naic_code', 'coverage_type', 'limit_amount', 'effective_limit_amount', 'effective_date', 'expiration_date', 'is_active', 'created_at', 'updated_at'],
    documents: ['id', 'vendor_id', 'company_name', 'doc_type', 'expiration_date', 'policy_amount', 'coverages', 'file_url', 'original_filename', 'mime_type', 'checksum_sha256', 'extraction_status', 'extracted_data', 'created_at'],
    review_queue_items: ['review_id', 'document_id', 'vendor_id', 'review_type', 'status', 'confidence_score', 'details', 'resolved_by', 'resolved_at', 'created_at']
  };

  for (const [table, cols] of Object.entries(tableCols)) {
    let columns = [...cols];
    while (columns.length > 0) {
      const query = columns.join(', ');
      const { error } = await supabase.from(table).select(query).limit(1);
      if (error) {
        const match = error.message.match(new RegExp(`column ${table}\\.([^ ]+) does not exist`));
        if (match) {
          console.log(`${table} missing: ${match[1]}`);
          columns = columns.filter(c => c !== match[1]);
        } else {
          console.log(`${table} error:`, error.message);
          break;
        }
      } else {
        console.log(`${table} valid:`, columns.join(', '));
        break;
      }
    }
  }
}
testAll().catch(console.error);
