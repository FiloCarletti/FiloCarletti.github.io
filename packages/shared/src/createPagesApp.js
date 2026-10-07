import { createApp, watch } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import { initAuth } from './auth.js'
import { useSpace } from './spaces.js'
import { LINK_TOKEN } from './url.js'
import './styles.css'

/**
 * Avvia un'app della monorepo.
 *   createPagesApp(App, { routes })
 * Il router usa l'hash (#/percorso): GitHub Pages non ha rewrite lato server,
 * così il refresh di una sotto-pagina non dà mai 404.
 */
export function createPagesApp(Root, { routes } = {}) {
  const app = createApp(Root)
  if (routes?.length) {
    const router = createRouter({ history: createWebHashHistory(), routes })
    if (__APP_SLUG__ !== 'dashboard') keepSpaceInUrl(router)
    app.use(router)
  }
  initAuth()
  app.mount('#app')
  return app
}

/** Tiene `?space=<id>` (e il token del link, se c'è) in ogni URL dell'app. */
function keepSpaceInUrl(router) {
  const { spaceId } = useSpace()
  const extra = () => ({ space: spaceId.value, ...(LINK_TOKEN ? { k: LINK_TOKEN } : {}) })

  router.beforeEach((to) => {
    const id = spaceId.value
    if (!id) return true
    if (to.query.space && to.query.space !== id) {
      // Link verso un altro spazio: ricarica, così ogni vista rilegge i dati giusti.
      // L'URL di destinazione si scrive senza passare dal router (`href` è '#/percorso?space=…' con l'history a
      // hash), e la navigazione resta in sospeso: con `return false` il router riporterebbe l'URL allo spazio
      // di prima e annullerebbe la ricarica.
      const url = window.location.pathname + window.location.search + router.resolve(to).href
      window.history.replaceState(window.history.state, '', url)
      window.location.reload()
      return new Promise(() => {})
    }
    if (to.query.space === id && (to.query.k ?? null) === LINK_TOKEN) return true
    return { ...to, query: { ...to.query, ...extra() } }
  })
  // Spazio risolto dopo il caricamento (es. quello personale): scrivilo nell'URL. Si aspetta la prima
  // navigazione (le viste caricate a richiesta la ritardano): prima la rotta corrente è ancora '/' e un link
  // profondo (#/dettaglio/…?space=…) finirebbe sulla home.
  watch(spaceId, async (id) => {
    if (!id) return
    await router.isReady()
    const cur = router.currentRoute.value
    if (cur.query.space === id && (cur.query.k ?? null) === LINK_TOKEN) return
    router.replace({ path: cur.path, query: { ...cur.query, ...extra() } })
  })
}
