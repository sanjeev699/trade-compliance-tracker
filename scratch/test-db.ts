import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

async function run() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data, error } = await supabase
    .from('documents')
    .select('extracted_data')
    .ilike('company_name', '%Aldea%')
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    console.error(error)
    return
  }

  console.log(JSON.stringify(data[0]?.extracted_data, null, 2))
}

run()
