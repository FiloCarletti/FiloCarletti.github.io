// Gioco senza database: niente login né Supabase, solo localStorage (vedi game/save.js).
import { createApp } from 'vue'
import '@shared/styles.css'
import App from './App.vue'

createApp(App).mount('#app')
