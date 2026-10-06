<script setup>
import { RouterLink, RouterView } from 'vue-router'
import { AuthGate, AppShell, ToastHost } from '@shared'
import OfferForm from './components/OfferForm.vue'
import ProductForm from './components/ProductForm.vue'
import { useData } from './store.js'

const { ui } = useData()

const tabs = [
  { to: '/', label: 'Offerte' },
  { to: '/prodotti', label: 'I miei prodotti' },
  { to: '/supermercati', label: 'Supermercati' },
  { to: '/importa', label: 'Importa' },
  { to: '/dati', label: 'Dati' },
]
</script>

<template>
  <AuthGate>
    <AppShell title="Offerte" icon="🏷️">
      <nav class="tabs" aria-label="Sezioni">
        <RouterLink v-for="t in tabs" :key="t.to" :to="t.to" class="tab" :class="{ exact: t.to === '/' }">{{ t.label }}</RouterLink>
      </nav>
      <RouterView />
    </AppShell>
    <ProductForm v-if="ui.prodotto" />
    <OfferForm v-if="ui.offerta" />
  </AuthGate>
  <ToastHost />
</template>

<style scoped>
.tabs { display: flex; gap: 4px; margin: 0 0 16px; padding: 3px; background: var(--surface-2); border-radius: var(--radius); overflow-x: auto; scrollbar-width: none; }
.tab { flex: 1 0 auto; text-align: center; padding: 7px 10px; border-radius: 8px; color: var(--muted); text-decoration: none; font-weight: 500; font-size: .92rem; white-space: nowrap; }
.tab.router-link-active:not(.exact), .tab.exact.router-link-exact-active { background: var(--surface); color: var(--text); box-shadow: var(--shadow); }
@media (max-width: 420px) { .tab { font-size: .84rem; padding: 7px 7px; } }
</style>
