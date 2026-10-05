// Parametri nella parte hash dell'URL: #/percorso?space=<id>&k=<token>
// Lo spazio di dati sta nell'URL così il link si può condividere così com'è.

// Ritorno dal login Google (?code=…): ripristina l'hash salvato prima del login,
// prima che router e client Supabase leggano l'URL.
try {
  const saved = sessionStorage.getItem('filo-after-login')
  if (saved && new URLSearchParams(window.location.search).has('code')) {
    sessionStorage.removeItem('filo-after-login')
    if (!window.location.hash || window.location.hash === '#/') {
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search + saved)
    }
  }
} catch { /* storage non disponibile */ }
export function hashParams() {
  return new URLSearchParams(window.location.hash.split('?')[1] ?? '')
}

/** Token del link pubblico (se presente): viene mandato a Supabase in ogni richiesta. */
export const LINK_TOKEN = hashParams().get('k') || null

/** Link a uno spazio di un'app; con `token` è il link pubblico in sola lettura. */
export function spaceUrl(slug, spaceId, token = null) {
  const q = new URLSearchParams({ space: spaceId })
  if (token) q.set('k', token)
  return `${window.location.origin}/${slug}/#/?${q}`
}
