import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function check() {
  const { data, error } = await supabase.from('policy_lines').select('*')
  if (error) console.error('Error:', error)
  console.log('Policy lines:', data)
}

check()
