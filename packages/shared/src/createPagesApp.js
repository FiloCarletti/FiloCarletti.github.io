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
      window.location.hash = router.resolve(to).hash
      window.location.reload()
      return false
    }
    if (to.query.space === id && (to.query.k ?? null) === LINK_TOKEN) return true
    return { ...to, query: { ...to.query, ...extra() } }
  })
  // Spazio risolto dopo il caricamento (es. quello personale): scrivilo nell'URL.
  watch(spaceId, (id) => {
    if (id) router.replace({ query: { ...router.currentRoute.value.query, ...extra() } })
  })
}
