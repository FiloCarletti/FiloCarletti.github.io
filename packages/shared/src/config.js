// Configurazione pubblica condivisa da tutte le app.
// La chiave "publishable" è pensata per stare nel browser: la sicurezza dei dati
// è garantita dalle policy RLS sul database, NON dal segreto di questa chiave.
// Non mettere MAI qui la service_role / secret key.
export const SUPABASE_URL = 'https://jpqjsvmmgsyeohsunrzk.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_AIGQeBuH6vICW5bcXhb5vA_wMaaEdcw'

// Origine del sito GitHub Pages (dashboard su /, app su /<slug>/).
export const SITE_ORIGIN = 'https://filocarletti.github.io'
