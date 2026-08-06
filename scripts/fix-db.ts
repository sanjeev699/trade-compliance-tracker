import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function fix() {
  const { data: vendors } = await supabase.from('vendors').select('vendor_id, sc_id, company_name')
  console.log('Vendors:', vendors)

  const sanjeev = vendors?.find(v => v.sc_id === 'VND-1006' || v.company_name === 'Sanjeev')
  if (!sanjeev) {
    console.log('Sanjeev not found!')
    return
  }

  const { data: queue, error } = await supabase.from('review_queue_items').update({ vendor_id: sanjeev.vendor_id }).is('vendor_id', null).select('review_id')
  console.log('Updated queue items:', queue, error)
  
  const { data: queue2, error: error2 } = await supabase.from('review_queue_items').update({ vendor_id: sanjeev.vendor_id }).neq('vendor_id', sanjeev.vendor_id).select('review_id')
  console.log('Updated other queue items:', queue2, error2)
  
  const { data: docs } = await supabase.from('documents').update({ vendor_id: sanjeev.vendor_id }).select('id')
  console.log('Updated docs:', docs)
}

fix()
