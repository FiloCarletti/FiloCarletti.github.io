<script setup>
import { onMounted, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { AuthGate, AppShell, ToastHost, useSpace } from '@shared'
import { useData } from './store.js'

const { state, load } = useData()
const route = useRoute()
// "Monitoraggi" resta attiva anche dentro un monitoraggio e nel modulo
const attiva = (to) => (to === '/' ? route.path === '/' || route.path.startsWith('/ricerca') || route.path === '/nuova' : route.path.startsWith(to))
const { status } = useSpace()
// conteggio degli avvisi non letti per il badge, appena lo spazio è pronto
onMounted(() => { if (status.value === 'ok') load() })
watch(status, (s) => { if (s === 'ok') load() })

const tabs = [
  { to: '/', label: 'Monitoraggi' },
  { to: '/avvisi', label: 'Avvisi', badge: true },
  { to: '/fonti', label: 'Fonti' },
  { to: '/dati', label: 'Dati' },
]
</script>

<template>
  <AuthGate>
    <AppShell title="Voli" icon="✈️">
      <nav class="tabs" aria-label="Sezioni">
        <RouterLink v-for="t in tabs" :key="t.to" :to="t.to" class="tab" :class="{ on: attiva(t.to) }">
          {{ t.label }}<span v-if="t.badge && state.nonLetti" class="dot" :aria-label="`${state.nonLetti} non letti`">{{ state.nonLetti }}</span>
        </RouterLink>
      </nav>
      <RouterView />
    </AppShell>
  </AuthGate>
  <ToastHost />
</template>

<style scoped>
.tabs { display: flex; gap: 4px; margin: 0 0 16px; padding: 3px; background: var(--surface-2); border-radius: var(--radius); overflow-x: auto; scrollbar-width: none; }
.tab { flex: 1 0 auto; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 7px 10px; border-radius: 8px; color: var(--muted); text-decoration: none; font-weight: 500; font-size: .92rem; white-space: nowrap; }
.tab.on { background: var(--surface); color: var(--text); box-shadow: var(--shadow); }
.dot { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: var(--danger); color: #fff; font-size: .72rem; font-weight: 700; line-height: 18px; text-align: center; }
@media (max-width: 420px) { .tab { font-size: .84rem; padding: 7px 7px; } }
</style>
