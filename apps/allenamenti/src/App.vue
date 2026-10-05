<script setup>
import { RouterLink, RouterView } from 'vue-router'
import { AuthGate, AppShell, ToastHost, useSpace } from '@shared'

const { canWrite } = useSpace()

const tabs = [
  { to: '/', label: 'Panoramica' },
  { to: '/allenamenti', label: 'Allenamenti' },
  { to: '/esercizi', label: 'Esercizi' },
]
</script>

<template>
  <AuthGate>
    <AppShell title="Allenamenti" icon="🏋️">
      <template #actions>
        <RouterLink v-if="canWrite" to="/allenamenti/nuovo" class="btn btn-primary btn-sm" aria-label="Nuovo allenamento">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          <span class="hide-xs">Nuovo</span>
        </RouterLink>
      </template>
      <nav class="tabs" aria-label="Sezioni">
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
@media (max-width: 420px) { .hide-xs { display: none; } }
</style>
