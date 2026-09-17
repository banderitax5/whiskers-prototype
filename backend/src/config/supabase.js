import { createClient } from '@supabase/supabase-js'

// supabaseAuth - used ONLY for auth operations (signUp, signIn, getUser)
//   auth calls change the client's internal session state,
//   which would make subsequent database calls act as that user instead of service_role
export const supabaseAuth = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// supabaseUser - used for user-facing database queries (cart, orders, profile)
//   uses the anon key so RLS policies are enforced — users can only access their own rows
export const supabaseUser = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

// supabaseAdmin - used ONLY for admin operations (product CRUD, customer list, stats)
//   uses service_role to bypass RLS — admin endpoints have their own auth check
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)
