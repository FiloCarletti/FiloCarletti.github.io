<script setup>
// Controlli di condivisione di uno spazio (per i suoi proprietari): membri, link pubblico,
// nome ed eliminazione degli spazi condivisi. `info` è il risultato di rpc('space_info').
import { computed, reactive, ref } from 'vue'
import { supabase, unwrap } from '../supabase.js'
import { toast } from '../toast.js'
import { spaceUrl } from '../url.js'
import Avatar from './Avatar.vue'

const props = defineProps({ info: { type: Object, required: true } })
const emit = defineEmits(['changed', 'deleted'])

const busy = ref(false)
const form = reactive({ email: '', role: 'viewer' })
const members = computed(() => props.info.members ?? [])
const isTitolare = computed(() => props.info.my_role === 'owner')

async function call(fn, args, ok) {
  busy.value = true
  try {
    const res = unwrap(await supabase.rpc(fn, args))
    if (ok) toast.ok(ok)
    emit('changed')
    return res
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}

async function share() {
  if (!form.email.trim()) return
  await call('space_share', { p_space: props.info.id, p_email: form.email, p_role: form.role }, 'Condiviso')
  form.email = ''
}
const setRole = (m, role) => call('space_share', { p_space: props.info.id, p_email: m.email, p_role: role })
const remove = (m) => call('space_share', { p_space: props.info.id, p_email: m.email, p_role: null }, 'Condivisione rimossa')
const setLink = (on, reset = false) => call('space_set_link', { p_space: props.info.id, p_on: on, p_reset: reset })

function rename() {
  const name = prompt('Nome dello spazio', props.info.name)
  if (name?.trim()) call('space_rename', { p_space: props.info.id, p_name: name })
}
async function del() {
  if (!confirm(`Eliminare lo spazio "${props.info.name}"? Si può solo se è vuoto.`)) return
  busy.value = true
  try {
    unwrap(await supabase.rpc('space_delete', { p_space: props.info.id }))
    toast.ok('Spazio eliminato')
    emit('deleted')
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}

async function copy(withToken) {
  const url = spaceUrl(props.info.app_slug, props.info.id, withToken ? props.info.link_token : null)
  try {
    await navigator.clipboard.writeText(url)
    toast.ok(withToken ? 'Link pubblico copiato' : 'Link copiato')
  } catch {
    prompt('Copia il link:', url)
  }
}
</script>

<template>
  <div class="sharing" :class="{ busy }">
    <div class="block">
      <span class="label">Condividi con</span>
      <form class="share-form" @submit.prevent="share">
        <input v-model="form.email" type="email" class="input" placeholder="email@gmail.com" aria-label="Email" required />
        <select v-model="form.role" class="select" aria-label="Permesso">
          <option value="viewer">Lettura</option>
          <option value="editor">Modifica</option>
        </select>
        <button class="btn btn-primary">Condividi</button>
      </form>
      <p class="muted small hint">Chi può modificare diventa co-proprietario. Si può condividere solo con persone già abilitate al login.</p>
      <ul v-if="members.length" class="people">
        <li v-for="m in members" :key="m.email">
          <Avatar :name="m.name" :src="m.avatar" />
          <span class="grow ellipsis">{{ m.name }}<span class="muted small"> · {{ m.email }}</span></span>
          <select :value="m.role" class="select select-sm" :aria-label="`Permesso di ${m.name}`" @change="setRole(m, $event.target.value)">
            <option value="viewer">Lettura</option>
            <option value="editor">Modifica</option>
          </select>
          <button class="btn btn-ghost btn-icon btn-danger" :aria-label="`Rimuovi ${m.name}`" @click="remove(m)">✕</button>
        </li>
      </ul>
    </div>

    <div class="block">
      <label class="row" style="justify-content: space-between; flex-wrap: nowrap">
        <span>
          <strong>Chiunque abbia il link può vedere</strong>
          <span class="muted small" style="display: block">Sola lettura, anche senza account.</span>
        </span>
        <input type="checkbox" class="switch" :checked="!!info.link_token" @change="setLink($event.target.checked)" />
      </label>
      <div class="row" style="margin-top: 8px">
        <button v-if="info.link_token" class="btn btn-sm" @click="copy(true)">Copia link pubblico</button>
        <button v-if="info.link_token" class="btn btn-ghost btn-sm" title="Il vecchio link smette di funzionare" @click="setLink(true, true)">Rigenera</button>
        <button class="btn btn-ghost btn-sm" @click="copy(false)">Copia link per i membri</button>
      </div>
    </div>

    <div v-if="info.kind === 'shared'" class="block row">
      <button class="btn btn-ghost btn-sm" @click="rename">Rinomina</button>
      <button v-if="isTitolare" class="btn btn-ghost btn-sm btn-danger" @click="del">Elimina spazio</button>
    </div>
  </div>
</template>

<style scoped>
.sharing { display: flex; flex-direction: column; gap: 12px; }
.busy { opacity: .6; pointer-events: none; }
.block { border-top: 1px solid var(--border); padding-top: 12px; }
.hint { margin: 6px 0 0; }
.people { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 6px; }
.people li { display: flex; align-items: center; gap: 10px; min-width: 0; }
.grow { flex: 1; min-width: 0; }
.ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.share-form { display: grid; gap: 8px; grid-template-columns: 1fr auto; margin-top: 6px; }
.share-form .input { grid-column: 1 / -1; }
@media (min-width: 520px) { .share-form { grid-template-columns: 1fr auto auto; } .share-form .input { grid-column: auto; } }
.select-sm { width: auto; padding: 5px 8px; font-size: .86rem; }
.switch { width: 20px; height: 20px; flex-shrink: 0; accent-color: var(--primary); }
</style>
