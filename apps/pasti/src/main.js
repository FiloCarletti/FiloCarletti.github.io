import { createPagesApp } from '@shared'
import App from './App.vue'
import PanoramicaView from './views/PanoramicaView.vue'

createPagesApp(App, {
  routes: [
    { path: '/', name: 'panoramica', component: PanoramicaView },
    { path: '/diario', name: 'diario', component: () => import('./views/DiarioView.vue') },
    { path: '/report', name: 'report', component: () => import('./views/ReportView.vue') },
    { path: '/obiettivi', name: 'obiettivi', component: () => import('./views/ObiettiviView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
