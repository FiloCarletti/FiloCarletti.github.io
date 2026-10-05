import { createPagesApp } from '@shared'
import App from './App.vue'
import HomeView from './views/HomeView.vue'

createPagesApp(App, {
  routes: [
    { path: '/', name: 'home', component: HomeView },
    // { path: '/dettaglio/:id', name: 'detail', component: () => import('./views/DetailView.vue') },
  ],
})
