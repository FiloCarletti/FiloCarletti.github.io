import { createPagesApp } from '@shared'
import App from './App.vue'
import RicercheView from './views/RicercheView.vue'

createPagesApp(App, {
  routes: [
    { path: '/', name: 'ricerche', component: RicercheView },
    { path: '/nuova', name: 'nuova', component: () => import('./views/RicercaFormView.vue') },
    { path: '/ricerca/:id', name: 'ricerca', component: () => import('./views/RicercaView.vue') },
    { path: '/ricerca/:id/modifica', name: 'modifica', component: () => import('./views/RicercaFormView.vue') },
    { path: '/avvisi', name: 'avvisi', component: () => import('./views/AvvisiView.vue') },
    { path: '/fonti', name: 'fonti', component: () => import('./views/FontiView.vue') },
    { path: '/dati', name: 'dati', component: () => import('./views/DatiView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
