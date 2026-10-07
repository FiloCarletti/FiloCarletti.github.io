<script setup>
// "Cerca ora": rimanda a Claude con il prompt pronto (tutto lo spazio o un monitoraggio). Se c'è il link della routine
// (salvato in Dati), si può anche aprire la routine e avviarla subito.
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { toast, useSpace } from '@shared'
import Modal from './Modal.vue'
import { claudeUrl, promptCercaOra, SKILL } from '../lib/claude.js'
import { pref } from '../store.js'

const props = defineProps({ ricerca: { type: Object, default: null }, small: { type: Boolean, default: false } })
const { spaceId } = useSpace()
const open = ref(false)
const routine = computed(() => (open.value ? pref('routineUrl', '') : ''))
const prompt = computed(() => promptCercaOra({ spaceId: spaceId.value, ricerca: props.ricerca }))

async function copia(silenzioso = false) {
  try {
    await navigator.clipboard.writeText(prompt.value)
    if (!silenzioso) toast.ok('Prompt copiato')
  } catch {
    if (!silenzioso) toast.error('Copia non riuscita: seleziona il testo e copialo a mano.')
  }
}
async function apriClaude() {
  await copia(true)
  window.open(claudeUrl(prompt.value), '_blank', 'noopener')
}
</script>

<template>
  <button type="button" class="btn" :class="small ? 'btn-sm' : ''" @click="open = true">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
    Cerca ora
  </button>
  <Modal v-if="open" title="Cerca ora con Claude" @close="open = false">
    <p class="small" style="margin: 0">
      La ricerca la fa Claude con la skill <strong>{{ SKILL }}</strong>: esegue gli script della repo e registra i prezzi qui.
      Serve <strong>Claude Code</strong> (desktop, web o terminale) oppure la routine, con il connettore Supabase.
      {{ ricerca ? `Cercherà solo «${ricerca.nome}».` : 'Cercherà tutti i monitoraggi attivi di questo spazio.' }}
    </p>
    <textarea class="textarea mono small" readonly rows="4" :value="prompt" aria-label="Prompt" @focus="$event.target.select()" />
    <p v-if="!routine" class="muted small" style="margin: 0">
      Dopo aver creato la routine pianificata, salva il suo link in <RouterLink to="/dati" @click="open = false">Dati</RouterLink>:
      da qui potrai avviarla con un tocco.
    </p>
    <template #foot>
      <a v-if="routine" :href="routine" target="_blank" rel="noopener" class="btn btn-primary">Apri la routine ↗</a>
      <button type="button" class="btn" :class="routine ? '' : 'btn-primary'" @click="apriClaude">Apri Claude ↗</button>
      <button type="button" class="btn btn-ghost" @click="copia()">Copia prompt</button>
    </template>
  </Modal>
</template>

<style scoped>
.mono { font-family: var(--mono); }
</style>
