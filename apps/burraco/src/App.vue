<script setup>
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { AuthGate, AppShell, ToastHost } from '@shared'

const route = useRoute()
const atTable = computed(() => route.name === 'table')

const tabs = [
  { to: '/', label: 'Gioca' },
  { to: '/segnapunti', label: 'Segnapunti' },
  { to: '/statistiche', label: 'Statistiche' },
]
</script>

<template>
  <AuthGate>
    <AppShell title="Burraco" icon="🃏">
      <nav v-if="!atTable" class="tabs" aria-label="Sezioni">
        <RouterLink v-for="t in tabs" :key="t.to" :to="t.to" class="tab" :class="{ exact: t.to === '/' }">{{ t.label }}</RouterLink>
      </nav>
      <RouterView />
    </AppShell>
  </AuthGate>
  <ToastHost />
</template>

<style scoped>
.tabs { display: flex; gap: 4px; margin: -4px 0 16px; padding: 3px; background: var(--surface-2); border-radius: var(--radius); }
.tab { flex: 1; text-align: center; padding: 7px 8px; border-radius: 8px; color: var(--muted); text-decoration: none; font-weight: 500; font-size: .92rem; }
.tab.router-link-active:not(.exact), .tab.exact.router-link-exact-active { background: var(--surface); color: var(--text); box-shadow: var(--shadow); }
</style>
