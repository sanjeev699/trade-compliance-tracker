import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function cleanup() {
  const { data, error } = await supabase
    .from('policy_lines')
    .delete()
    .is('document_id', null)
  
  if (error) {
    console.error('Error cleaning up orphaned policies:', error)
  } else {
    console.log('Successfully cleaned up orphaned policy lines')
  }
}

cleanup()
