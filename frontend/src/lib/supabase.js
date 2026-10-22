import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Captured before createClient processes the URL, so a recovery redirect
// is still detectable after Supabase strips the params.
export const hadRecoveryMarker = /[?&#](code|access_token)=|type=recovery/.test(
  window.location.search + window.location.hash
);

// True when Supabase just redirected back from an email-confirmation link.
// Captured here, before createClient() consumes and clears the URL params, so
// the app can greet the shopper once. Failed links carry ?/#error=... instead.
export const justVerifiedEmail =
  /type=signup/.test(window.location.search + window.location.hash) &&
  !/[?&#]error=/.test(window.location.search + window.location.hash);

// Set while a recovery session is live and the new password has not been
// saved yet; the app gates navigation on this until the reset completes.
export const RECOVERY_PENDING_KEY = 'whiskers.recovery-pending'

const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase
