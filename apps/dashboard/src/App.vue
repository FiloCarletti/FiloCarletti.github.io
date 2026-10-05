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
        <RouterLink v-if="state.admin && route.name !== 'access'" to="/accessi" class="btn btn-ghost btn-sm" title="Gestisci utenti e accessi">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span class="hide-xs">Accessi</span>
        </RouterLink>
        <RouterLink v-else-if="route.name === 'access'" to="/" class="btn btn-ghost btn-sm">App</RouterLink>
      </template>
      <RouterView />
    </AppShell>
  </AuthGate>
  <ToastHost />
</template>

<style scoped>
@media (max-width: 420px) { .hide-xs { display: none; } }
</style>
