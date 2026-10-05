import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import { initAuth } from './auth.js'
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
    app.use(createRouter({ history: createWebHashHistory(), routes }))
  }
  initAuth()
  app.mount('#app')
  return app
}
