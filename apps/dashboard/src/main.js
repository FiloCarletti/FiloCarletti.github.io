import { createPagesApp } from '@shared'
import App from './App.vue'
import HomeView from './views/HomeView.vue'

createPagesApp(App, {
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/accessi', name: 'access', component: () => import('./views/AccessView.vue') },
    { path: '/amici/:email', name: 'friend', component: () => import('./views/FriendView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
