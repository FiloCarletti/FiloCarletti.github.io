<script setup>
// Pannello dello spazio corrente: proprietari, condivisione (per i proprietari), altri spazi propri.
import { computed, ref } from 'vue'
import { supabase, unwrap } from '../supabase.js'
import { toast } from '../toast.js'
import { useAuth } from '../auth.js'
import { refreshSpace, useSpace } from '../spaces.js'
import { spaceUrl } from '../url.js'
import Avatar from './Avatar.vue'
import SpaceSharing from './SpaceSharing.vue'

const emit = defineEmits(['close'])
const { session, signInWithGoogle } = useAuth()
const { info, mine, owners, ownersLabel, canWrite, canManage, viaLink, shareUrl } = useSpace()

const busy = ref(false)
// Solo gli spazi di cui si è (co)proprietari: i dati degli altri si aprono dalla Community.
const others = computed(() => mine.value.filter((s) => s.id !== info.value?.id && (s.role === 'owner' || s.role === 'editor')))
const myRoleText = computed(() => ({ owner: 'Sei il titolare', editor: 'Sei co-proprietario', viewer: 'Sola lettura', link: 'Sola lettura (link pubblico)' })[info.value?.my_role])

async function onChanged() {
  try { await refreshSpace() } catch (e) { toast.error(e) }
}

async function leave() {
  if (!confirm('Uscire da questo spazio? Non lo vedrai più finché non te lo ricondividono.')) return
  busy.value = true
  try {
    unwrap(await supabase.rpc('space_share', { p_space: info.value.id, p_email: session.value?.user?.email, p_role: null }))
    window.location.href = '/'
  } catch (e) {
    toast.error(e)
    busy.value = false
  }
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareUrl(false))
    toast.ok('Link copiato')
  } catch {
    prompt('Copia il link:', shareUrl(false))
  }
}
function open(s) {
  window.location.href = spaceUrl(__APP_SLUG__, s.id)
  window.location.reload()
}
// Spazio eliminato: si torna allo spazio predefinito (quello personale).
function goHome() {
  window.location.hash = '#/'
  window.location.reload()
}
const spaceName = (s) => (s.kind === 'shared' ? s.name : 'Il tuo spazio personale')
</script>

<template>
  <div class="sheet-backdrop" @click.self="emit('close')">
    <section class="sheet card" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <header class="row-between" style="flex-wrap: nowrap">
        <div>
          <h2 id="sheet-title" style="margin: 0">{{ ownersLabel }}</h2>
          <div class="muted small">{{ info?.kind === 'shared' ? info.name + ' · ' : '' }}{{ myRoleText }}</div>
        </div>
        <button class="btn btn-ghost btn-icon" aria-label="Chiudi" @click="emit('close')">✕</button>
      </header>

      <div class="block">
        <span class="label">Proprietari</span>
        <ul class="people">
          <li v-for="(o, i) in owners" :key="o.email ?? i">
            <Avatar :name="o.name" :src="o.avatar" />
            <span class="grow">{{ o.name }}<span v-if="o.me" class="muted"> (tu)</span></span>
            <span v-if="i === 0" class="badge">titolare</span>
          </li>
        </ul>
        <p v-if="info?.viewer_count && !canManage" class="muted small" style="margin: 6px 0 0">
          + {{ info.viewer_count }} {{ info.viewer_count === 1 ? 'persona' : 'persone' }} in sola lettura
        </p>
      </div>

      <SpaceSharing v-if="canManage" :info="info" @changed="onChanged" @deleted="goHome" />

      <div v-if="!canManage" class="block row">
        <button v-if="!viaLink" class="btn btn-sm" @click="copyLink">Copia link</button>
        <button v-else-if="!session" class="btn btn-primary btn-sm" @click="signInWithGoogle">Accedi</button>
        <button v-if="info?.my_role === 'viewer'" class="btn btn-ghost btn-sm btn-danger" :disabled="busy" @click="leave">Esci da questo spazio</button>
      </div>
      <div v-else-if="info?.my_role === 'editor'" class="row">
        <button class="btn btn-ghost btn-sm btn-danger" :disabled="busy" @click="leave">Esci da questo spazio</button>
      </div>

      <div v-if="others.length && !viaLink" class="block">
        <span class="label">I tuoi altri spazi in questa app</span>
        <ul class="people">
          <li v-for="s in others" :key="s.id" class="clickable" @click="open(s)">
            <span>{{ s.kind === 'shared' ? '👥' : '👤' }}</span>
            <span class="grow">{{ spaceName(s) }}</span>
          </li>
        </ul>
      </div>
      <p v-if="!canWrite" class="muted small" style="margin: 0">Stai guardando dati in sola lettura.</p>
    </section>
  </div>
</template>

<style scoped>
.sheet-backdrop { position: fixed; inset: 0; z-index: 50; background: rgb(0 0 0 / .35); display: flex; align-items: flex-start; justify-content: center; padding: 64px 12px 12px; overflow-y: auto; }
.sheet { width: min(520px, 100%); display: flex; flex-direction: column; gap: 14px; }
.block { border-top: 1px solid var(--border); padding-top: 12px; }
.people { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 6px; }
.people li { display: flex; align-items: center; gap: 10px; min-width: 0; }
.grow { flex: 1; min-width: 0; }
.clickable { cursor: pointer; padding: 6px; margin: 0 -6px; border-radius: 8px; }
.clickable:hover { background: var(--surface-2); }
</style>
