import { createPagesApp } from '@shared'
import App from './App.vue'
import PlayView from './views/PlayView.vue'

createPagesApp(App, {
  routes: [
    { path: '/', name: 'play', component: PlayView },
    { path: '/tavolo', name: 'table', component: () => import('./views/TableView.vue') },
    { path: '/segnapunti', name: 'scores', component: () => import('./views/ScoresView.vue') },
    { path: '/segnapunti/:id', name: 'score', component: () => import('./views/ScoreMatchView.vue') },
    { path: '/statistiche', name: 'stats', component: () => import('./views/StatsView.vue') },
    { path: '/regole', name: 'rules', component: () => import('./views/RulesView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
