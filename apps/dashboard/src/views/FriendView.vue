<script setup>
// Profilo di un amico: i suoi spazi a cui ho accesso, raggruppati per app.
import { computed, onMounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Avatar, spaceUrl } from '@shared'
import { loadCatalog, useCatalog } from '../catalog.js'

const route = useRoute()
const { state, friends } = useCatalog()
onMounted(loadCatalog)

const friend = computed(() => friends.value.find((f) => f.email === route.params.email) ?? null)
const ROLE = { viewer: 'Lettura', editor: 'Modifica' }
const spaceName = (s) => (s.kind === 'shared' ? s.name : 'Dati personali')
</script>

<template>
  <div class="stack" style="gap: 16px">
    <RouterLink to="/" class="small">← Le mie app</RouterLink>

    <div v-if="!state.loaded" class="card empty"><div class="spinner" style="margin: 0 auto" /></div>
    <div v-else-if="!friend" class="card empty">Nessuna condivisione da questa persona.</div>

    <template v-else>
      <header class="profile">
        <Avatar :name="friend.name" :src="friend.avatar" :size="64" />
        <div style="min-width: 0">
          <h2 style="margin: 0">{{ friend.name }}</h2>
          <div class="muted small ellipsis">{{ friend.email }}</div>
        </div>
      </header>

      <h3 class="section-title">Condiviso con te</h3>
      <div class="list">
        <a v-for="s in friend.spaces" :key="s.id" :href="spaceUrl(s.app_slug, s.id)" class="card item">
          <div class="app-icon">{{ s.app.icon }}</div>
          <div style="flex: 1; min-width: 0">
            <strong>{{ s.app.name }}</strong>
            <div class="muted small">{{ spaceName(s) }}</div>
          </div>
          <span class="badge" :class="{ 'badge-primary': s.role === 'editor' }">{{ ROLE[s.role] }}</span>
        </a>
      </div>
    </template>
  </div>
</template>

<style scoped>
.profile { display: flex; align-items: center; gap: 14px; }
.section-title { font-size: .8rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin: 0; }
.list { display: grid; gap: 10px; }
.item { display: flex; align-items: center; gap: 12px; color: inherit; text-decoration: none; transition: transform .15s, border-color .15s; }
.item:hover { transform: translateY(-2px); border-color: var(--primary); }
.app-icon { font-size: 1.6rem; width: 44px; height: 44px; display: grid; place-items: center; background: var(--surface-2); border-radius: 12px; flex-shrink: 0; }
.ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
