import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js'

// Un solo client per tutte le app. Stessa origine (filocarletti.github.io) =
// stessa sessione: fai login una volta e sei dentro ovunque.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    flowType: 'pkce', // il codice torna in ?code=..., non nell'hash (usato dal router)
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'filo-pages-auth',
  },
})

/** Restituisce `data` oppure lancia l'errore di Supabase. */
export function unwrap({ data, error }) {
  if (error) throw error
  return data
}
