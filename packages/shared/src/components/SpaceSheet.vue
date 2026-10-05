<script setup>
// Pannello dello spazio corrente: proprietari, condivisione, link pubblico, altri spazi.
import { computed, reactive, ref } from 'vue'
import { supabase, unwrap } from '../supabase.js'
import { toast } from '../toast.js'
import { useAuth } from '../auth.js'
import { refreshSpace, useSpace } from '../spaces.js'
import { spaceUrl } from '../url.js'
import Avatar from './Avatar.vue'

const emit = defineEmits(['close'])
const { session, signInWithGoogle } = useAuth()
const { info, mine, owners, ownersLabel, canWrite, canManage, viaLink, shareUrl } = useSpace()

const busy = ref(false)
const form = reactive({ email: '', role: 'viewer' })
const members = computed(() => info.value?.members ?? [])
// Solo gli spazi di cui si è (co)proprietari: i dati degli altri si aprono dalla Community.
const others = computed(() => mine.value.filter((s) => s.id !== info.value?.id && (s.role === 'owner' || s.role === 'editor')))
const myRoleText = computed(() => ({ owner: 'Sei il titolare', editor: 'Puoi modificare', viewer: 'Sola lettura', link: 'Sola lettura (link pubblico)' })[info.value?.my_role])

async function call(fn, args, ok) {
  busy.value = true
  try {
    const res = unwrap(await supabase.rpc(fn, args))
    await refreshSpace()
    if (ok) toast.ok(ok)
    return res
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}

async function share() {
  if (!form.email.trim()) return
  await call('space_share', { p_space: info.value.id, p_email: form.email, p_role: form.role }, 'Condiviso')
  form.email = ''
}
const setRole = (m, role) => call('space_share', { p_space: info.value.id, p_email: m.email, p_role: role })
const remove = (m) => call('space_share', { p_space: info.value.id, p_email: m.email, p_role: null }, 'Condivisione rimossa')
const setLink = (on, reset = false) => call('space_set_link', { p_space: info.value.id, p_on: on, p_reset: reset })

async function leave() {
  if (!confirm('Uscire da questo spazio? Non lo vedrai più finché non te lo ricondividono.')) return
  const me = session.value?.user?.email
  busy.value = true
  try {
    unwrap(await supabase.rpc('space_share', { p_space: info.value.id, p_email: me, p_role: null }))
    window.location.href = '/'
  } catch (e) {
    toast.error(e)
    busy.value = false
  }
}

async function copy(text, what) {
  try {
    await navigator.clipboard.writeText(text)
    toast.ok(`${what} copiato`)
  } catch {
    prompt('Copia il link:', text)
  }
}
function open(s) {
  window.location.href = spaceUrl(__APP_SLUG__, s.id)
  window.location.reload()
}
const spaceName = (s) => (s.kind === 'shared' ? s.name : s.role === 'owner' ? 'Il tuo spazio personale' : `Spazio di ${s.ownerName}`)
</script>

<template>
  <div class="sheet-backdrop" @click.self="emit('close')">
    <section class="sheet card" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <header class="row-between">
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

      <template v-if="canManage">
        <div class="block">
          <span class="label">Condividi con</span>
          <form class="share-form" @submit.prevent="share">
            <input v-model="form.email" type="email" class="input" placeholder="email@gmail.com" aria-label="Email" required />
            <select v-model="form.role" class="select" aria-label="Permesso">
              <option value="viewer">Lettura</option>
              <option value="editor">Modifica</option>
            </select>
            <button class="btn btn-primary" :disabled="busy">Condividi</button>
          </form>
          <p class="muted small" style="margin: 6px 0 0">Chi può modificare diventa co-proprietario. Si può condividere solo con persone già abilitate al login.</p>
          <ul v-if="members.length" class="people" style="margin-top: 10px">
            <li v-for="m in members" :key="m.email">
              <Avatar :name="m.name" :src="m.avatar" />
              <span class="grow ellipsis">{{ m.name }}<span class="muted small"> · {{ m.email }}</span></span>
              <select :value="m.role" class="select select-sm" :aria-label="`Permesso di ${m.name}`" :disabled="busy" @change="setRole(m, $event.target.value)">
                <option value="viewer">Lettura</option>
                <option value="editor">Modifica</option>
              </select>
              <button class="btn btn-ghost btn-icon btn-danger" :aria-label="`Rimuovi ${m.name}`" :disabled="busy" @click="remove(m)">✕</button>
            </li>
          </ul>
        </div>

        <div class="block">
          <label class="row" style="justify-content: space-between; flex-wrap: nowrap">
            <span>
              <strong>Chiunque abbia il link può vedere</strong>
              <span class="muted small" style="display: block">Sola lettura, anche senza account.</span>
            </span>
            <input type="checkbox" class="switch" :checked="!!info?.link_token" :disabled="busy" @change="setLink($event.target.checked)" />
          </label>
          <div v-if="info?.link_token" class="row" style="margin-top: 8px">
            <button class="btn btn-sm" @click="copy(shareUrl(true), 'Link pubblico')">Copia link pubblico</button>
            <button class="btn btn-ghost btn-sm" :disabled="busy" @click="setLink(true, true)" title="Il vecchio link smette di funzionare">Rigenera</button>
          </div>
        </div>
      </template>

      <div class="block row">
        <button v-if="!viaLink" class="btn btn-sm" @click="copy(shareUrl(false), 'Link')">Copia link per i membri</button>
        <button v-else-if="!session" class="btn btn-primary btn-sm" @click="signInWithGoogle">Accedi</button>
        <button v-if="info?.my_role === 'viewer' || info?.my_role === 'editor'" class="btn btn-ghost btn-sm btn-danger" :disabled="busy" @click="leave">Esci da questo spazio</button>
      </div>

      <div v-if="others.length && !viaLink" class="block">
        <span class="label">I tuoi altri spazi in questa app</span>
        <ul class="people">
          <li v-for="s in others" :key="s.id" class="clickable" @click="open(s)">
            <span>{{ s.kind === 'shared' ? '👥' : '👤' }}</span>
            <span class="grow">{{ spaceName(s) }}</span>
            <span class="badge">{{ s.role === 'viewer' ? 'lettura' : s.role === 'editor' ? 'modifica' : 'tuo' }}</span>
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
.ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.share-form { display: grid; gap: 8px; grid-template-columns: 1fr auto; margin-top: 6px; }
.share-form .input { grid-column: 1 / -1; }
@media (min-width: 520px) { .share-form { grid-template-columns: 1fr auto auto; } .share-form .input { grid-column: auto; } }
.select-sm { width: auto; padding: 5px 8px; font-size: .86rem; }
.switch { width: 20px; height: 20px; flex-shrink: 0; accent-color: var(--primary); }
.clickable { cursor: pointer; padding: 6px; margin: 0 -6px; border-radius: 8px; }
.clickable:hover { background: var(--surface-2); }
</style>
