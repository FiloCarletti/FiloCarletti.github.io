import { createPagesApp } from '@shared'
import App from './App.vue'
import OfferteView from './views/OfferteView.vue'

createPagesApp(App, {
  routes: [
    { path: '/', name: 'offerte', component: OfferteView },
    { path: '/prodotti', name: 'prodotti', component: () => import('./views/ProdottiView.vue') },
    { path: '/prodotti/:id', name: 'prodotto', component: () => import('./views/ProdottoView.vue') },
    { path: '/supermercati', name: 'supermercati', component: () => import('./views/SupermercatiView.vue') },
    { path: '/importa', name: 'importa', component: () => import('./views/ImportaView.vue') },
    { path: '/dati', name: 'dati', component: () => import('./views/DatiView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
