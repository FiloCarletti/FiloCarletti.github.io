import { createPagesApp } from '@shared'
import App from './App.vue'
import MovimentiView from './views/MovimentiView.vue'

createPagesApp(App, {
  routes: [
    { path: '/', name: 'movimenti', component: MovimentiView },
    { path: '/statistiche', name: 'stats', component: () => import('./views/StatsView.vue') },
    { path: '/riclassifica', name: 'riclassifica', component: () => import('./views/RiclassificaView.vue') },
    { path: '/gestisci', name: 'gestisci', component: () => import('./views/GestisciView.vue') },
    { path: '/importa', name: 'importa', component: () => import('./views/ImportView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
