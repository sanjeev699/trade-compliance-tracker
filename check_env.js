const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

// Note: To modify constraints, we need postgres connection or we must run it via Supabase SQL editor.
// However, I will try to use the REST API to bypass or see if I have postgres URL in env.
console.log(process.env);
