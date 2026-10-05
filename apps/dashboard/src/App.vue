<script setup>
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { AuthGate, AppShell, ToastHost } from '@shared'
import { useCatalog } from './catalog.js'

const { state } = useCatalog()
const route = useRoute()
</script>

<template>
  <AuthGate>
    <AppShell title="Le mie app" icon="🏠" :back="false">
      <template #actions>
        <RouterLink v-if="route.name !== 'shares'" to="/condivisioni" class="btn btn-ghost btn-sm" title="I tuoi dati e con chi li condividi">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4"/><path d="m15.4 6.5-6.8 4"/></svg>
          <span class="hide-xs">Condivisioni</span>
        </RouterLink>
        <RouterLink v-if="state.admin && route.name !== 'access'" to="/accessi" class="btn btn-ghost btn-sm" title="Gestisci utenti e app abilitate">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span class="hide-xs">Accessi</span>
        </RouterLink>
      </template>
      <RouterView />
    </AppShell>
  </AuthGate>
  <ToastHost />
</template>

<style scoped>
@media (max-width: 520px) { .hide-xs { display: none; } }
</style>
