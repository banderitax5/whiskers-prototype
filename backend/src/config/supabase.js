import { createClient } from '@supabase/supabase-js'

// supabaseAuth - used ONLY for auth operations (signUp, signIn, getUser)
//   auth calls like signUp/signIn change the client's internal session state,
//   which would make subsequent database calls act as that user instead of service_role
export const supabaseAuth = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// supabaseAdmin - used for ALL database operations (select, update, upsert)
//   this one never touches auth, so it always stays in service_role mode and bypasses RLS
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)
