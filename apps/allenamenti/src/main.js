import { createPagesApp } from '@shared'
import App from './App.vue'
import StatsView from './views/StatsView.vue'

createPagesApp(App, {
  routes: [
    { path: '/', name: 'stats', component: StatsView },
    { path: '/allenamenti', name: 'sessions', component: () => import('./views/SessionsView.vue') },
    { path: '/allenamenti/nuovo', name: 'new', component: () => import('./views/SessionFormView.vue') },
    { path: '/allenamenti/:id', name: 'edit', component: () => import('./views/SessionFormView.vue') },
    { path: '/allenamenti/:id/guida', name: 'guided', component: () => import('./views/GuidedView.vue') },
    { path: '/allenamenti/:id/svolgi', name: 'workout', component: () => import('./views/WorkoutView.vue') },
    { path: '/programma', name: 'plan', component: () => import('./views/PlanView.vue') },
    { path: '/esercizi', name: 'exercises', component: () => import('./views/ExercisesView.vue') },
    { path: '/esercizi/:id', name: 'exercise', component: () => import('./views/ExerciseView.vue') },
    { path: '/importa', name: 'import', component: () => import('./views/ImportView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
