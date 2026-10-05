<script setup>
import { computed, ref } from 'vue'
import { useAuth } from '../auth.js'
import { useSpace } from '../spaces.js'
import Avatar from './Avatar.vue'
import SpaceSheet from './SpaceSheet.vue'

defineProps({
  title: { type: String, required: true },
  icon: { type: String, default: '' },
  // false sulla dashboard: nasconde il link "torna alla dashboard"
  back: { type: Boolean, default: true },
})
const { session, email, avatar, signOut, signInWithGoogle } = useAuth()
const { spaceId, owners, ownersLabel, canWrite, canManage } = useSpace()
const sheet = ref(false)
// Sotto il titolo: di chi sono i dati che si stanno guardando.
const shownOwners = computed(() => owners.value.slice(0, 3))
</script>

<template>
  <div class="shell">
    <header class="shell-header">
      <div class="shell-left">
        <a v-if="back && session" href="/" class="btn btn-ghost btn-icon" title="Dashboard" aria-label="Torna alla dashboard">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </a>
        <span v-if="icon" class="shell-icon">{{ icon }}</span>
        <div class="shell-titles">
          <h1 class="shell-title">{{ title }}</h1>
          <button v-if="spaceId" class="owner" :title="canManage ? 'Proprietari e condivisione' : 'Proprietari'" @click="sheet = true">
            <span class="owner-avatars">
              <Avatar v-for="(o, i) in shownOwners" :key="o.email ?? i" :name="o.name" :src="o.avatar" :size="18" />
            </span>
            <span class="owner-label">{{ ownersLabel }}</span>
            <span v-if="!canWrite" class="owner-ro">· sola lettura</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
          </button>
        </div>
      </div>
      <div class="shell-right">
        <slot name="actions" />
        <template v-if="session">
          <img v-if="avatar" :src="avatar" :alt="email" :title="email" class="avatar" referrerpolicy="no-referrer" />
          <button class="btn btn-ghost btn-sm" @click="signOut">Esci</button>
        </template>
        <button v-else class="btn btn-sm" @click="signInWithGoogle">Accedi</button>
      </div>
    </header>
    <main class="shell-main">
      <slot />
    </main>
    <SpaceSheet v-if="sheet" @close="sheet = false" />
  </div>
</template>

<style scoped>
.shell { min-height: 100vh; display: flex; flex-direction: column; }
.shell-header {
  position: sticky; top: 0; z-index: 10;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 8px 16px; background: color-mix(in srgb, var(--bg) 85%, transparent);
  backdrop-filter: blur(8px); border-bottom: 1px solid var(--border);
}
.shell-left, .shell-right { display: flex; align-items: center; gap: 8px; min-width: 0; }
.shell-right { flex-shrink: 0; }
.shell-icon { font-size: 1.3rem; }
.shell-titles { display: flex; flex-direction: column; min-width: 0; }
.shell-title { font-size: 1.05rem; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.owner {
  display: inline-flex; align-items: center; gap: 5px; max-width: 100%; padding: 1px 6px 1px 0; margin: 1px 0 0;
  border: 0; background: none; color: var(--muted); font: inherit; font-size: .8rem; cursor: pointer; text-align: left; border-radius: 6px;
}
.owner:hover { color: var(--text); }
.owner-avatars { display: inline-flex; flex-shrink: 0; }
.owner-avatars > * + * { margin-left: -6px; }
.owner-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
.owner-ro { white-space: nowrap; }
.avatar { width: 28px; height: 28px; border-radius: 50%; }
.shell-main { width: 100%; max-width: var(--max-w); margin: 0 auto; padding: 20px 16px 48px; flex: 1; }
@media (max-width: 420px) { .avatar { display: none; } }
</style>
