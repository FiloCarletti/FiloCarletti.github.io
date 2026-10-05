<script setup>
// Quale spazio si sta guardando, e passaggio rapido agli altri: personale, condivisi, nuovi.
// Lo spazio sta nell'URL: cambiarlo ricarica la pagina, così ogni vista rilegge i dati giusti.
import { computed, ref } from 'vue'
import { supabase, unwrap, toast, useSpace, spaceUrl } from '@shared'
import { spaceIcon, spaceLabel, useData } from '../store.js'

const { mine, canWrite, viaLink } = useSpace()
const { currentSpace } = useData()
const open = ref(false)

const others = computed(() => mine.value.filter((s) => s.id !== currentSpace.value?.id))
const roleText = (s) => (s.role === 'viewer' ? 'sola lettura' : s.role === 'editor' ? 'co-proprietario' : s.kind === 'shared' ? 'titolare' : '')

function go(id) {
  window.location.href = spaceUrl(__APP_SLUG__, id)
  window.location.reload()
}
async function create() {
  const name = prompt('Nome del nuovo spazio condiviso (es. "Casa", "Vacanze 2026")')
  if (!name?.trim()) return
  try {
    const id = unwrap(await supabase.rpc('space_create', { p_app: __APP_SLUG__, p_name: name.trim() }))
    toast.ok('Creato: condividilo con il pulsante in alto')
    go(id)
  } catch (e) {
    toast.error(e)
  }
}
</script>

<template>
  <div v-if="currentSpace && !viaLink" class="picker">
    <button class="current" :aria-expanded="open" @click="open = !open">
      <span aria-hidden="true">{{ spaceIcon(currentSpace) }}</span>
      <strong class="name">{{ spaceLabel(currentSpace) }}</strong>
      <span v-if="!canWrite" class="badge">sola lettura</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
    </button>
    <span v-if="others.length && !open" class="muted small hint">{{ others.length }} {{ others.length === 1 ? 'altro spazio' : 'altri spazi' }}</span>

    <div v-if="open" class="backdrop" @click="open = false" />
    <div v-if="open" class="menu card" role="menu">
      <p class="muted small" style="margin: 0 0 6px">
        Ogni spazio ha i suoi movimenti e le sue categorie. Puoi comunque inserire una spesa in uno spazio diverso da quello aperto.
      </p>
      <button v-for="s in others" :key="s.id" class="item" role="menuitem" @click="go(s.id)">
        <span aria-hidden="true">{{ spaceIcon(s) }}</span>
        <span class="grow">{{ spaceLabel(s) }}</span>
        <span v-if="roleText(s)" class="muted small">{{ roleText(s) }}</span>
      </button>
      <button class="item add" role="menuitem" @click="create">
        <span aria-hidden="true">＋</span>
        <span class="grow">Nuovo spazio condiviso</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.picker { position: relative; display: flex; align-items: center; gap: 8px; margin: -6px 0 10px; flex-wrap: wrap; }
.current {
  display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px; max-width: 100%;
  border: 1px solid var(--border); background: var(--surface); color: var(--text); font: inherit; cursor: pointer;
}
.current:hover { background: var(--surface-2); }
.name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.menu { position: absolute; top: calc(100% + 6px); left: 0; z-index: 30; width: min(360px, calc(100vw - 32px)); padding: 10px; display: grid; gap: 2px; }
.item { display: flex; align-items: center; gap: 10px; padding: 9px 8px; border: 0; background: none; color: var(--text); font: inherit; text-align: left; border-radius: 8px; cursor: pointer; }
.item:hover { background: var(--surface-2); }
.item.add { color: var(--primary); font-weight: 500; }
.grow { flex: 1; min-width: 0; }
.backdrop { position: fixed; inset: 0; z-index: 29; }
.hint { white-space: nowrap; }
</style>
