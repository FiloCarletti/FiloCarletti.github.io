<script setup>
import { computed } from 'vue'
import { POINTS } from '../game/rules.js'

const props = defineProps({
  match: { type: Object, required: true },
  entry: { type: Object, required: true },
  saving: Boolean,
})
defineEmits(['continue', 'new', 'exit'])

const sc = computed(() => props.entry.score)
const over = computed(() => props.match.over && props.entry === props.match.history.at(-1))
const won = computed(() => props.match.winner === 0)
const who = (seat) => (seat == null ? null : seat === 0 ? 'Tu' : props.match.seats[seat].name)
const title = computed(() => {
  if (over.value) return won.value ? 'Hai vinto la partita! 🎉' : 'Hai perso la partita'
  return `Fine della mano ${props.entry.n}`
})
const subtitle = computed(() => {
  if (props.entry.endReason === 'chiusura') return props.entry.closer === 0 ? 'Hai chiuso tu' : `${who(props.entry.closer)} ha chiuso`
  return 'Tallone esaurito: nessuna chiusura'
})
const rows = computed(() => [
  { label: 'Carte in tavola', v: sc.value.map((s) => s.tavola) },
  { label: 'Carte in mano', v: sc.value.map((s) => -s.mano) },
  { label: `Burraco puliti (${POINTS.pulito})`, v: sc.value.map((s) => s.puliti * POINTS.pulito), hint: sc.value.map((s) => s.puliti) },
  ...(props.match.rules?.semi ? [{ label: `Burraco semipuliti (${POINTS.semipulito})`, v: sc.value.map((s) => (s.semipuliti ?? 0) * POINTS.semipulito), hint: sc.value.map((s) => s.semipuliti ?? 0) }] : []),
  { label: `Burraco sporchi (${POINTS.sporco})`, v: sc.value.map((s) => s.sporchi * POINTS.sporco), hint: sc.value.map((s) => s.sporchi) },
  { label: 'Chiusura', v: sc.value.map((s) => (s.chiusura ? POINTS.chiusura : 0)) },
  { label: 'Pozzetto non preso', v: sc.value.map((s) => (s.pozzetto ? 0 : -POINTS.pozzetto)) },
])
const fmt = (v) => (v > 0 ? `+${v}` : v === 0 ? '—' : `−${-v}`)
</script>

<template>
  <div class="overlay" role="dialog" aria-modal="true" :aria-label="title">
    <div class="sheet card stack">
      <div>
        <h2 style="margin: 0">{{ title }}</h2>
        <p class="muted small" style="margin: 2px 0 0">{{ subtitle }}<template v-if="over"> · mano {{ entry.n }}</template></p>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr><th></th><th class="num">Noi</th><th class="num">Loro</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.label">
              <td>{{ r.label }}</td>
              <td v-for="t in [0, 1]" :key="t" class="num">
                {{ fmt(r.v[t]) }}<span v-if="r.hint && r.hint[t]" class="muted small"> ×{{ r.hint[t] }}</span>
              </td>
            </tr>
            <tr class="strong">
              <td>Totale mano</td>
              <td v-for="t in [0, 1]" :key="t" class="num">{{ sc[t].totale }}</td>
            </tr>
            <tr class="strong total">
              <td>Partita (a {{ match.target }})</td>
              <td v-for="t in [0, 1]" :key="t" class="num" :class="{ lead: match.scores[t] > match.scores[1 - t] }">{{ match.scores[t] }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="!over" class="muted small" style="margin: 0">
        Mancano {{ Math.max(0, match.target - match.scores[0]) }} a noi e {{ Math.max(0, match.target - match.scores[1]) }} a loro.
      </p>
      <p v-else-if="saving" class="muted small" style="margin: 0">Salvataggio del risultato…</p>
      <div class="row" style="justify-content: flex-end">
        <template v-if="over">
          <button class="btn" @click="$emit('exit')">Chiudi</button>
          <button class="btn btn-primary" @click="$emit('new')">Rivincita</button>
        </template>
        <button v-else class="btn btn-primary" @click="$emit('continue')">Mano successiva</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; z-index: 50; background: rgb(0 0 0 / .45); display: grid; place-items: center; padding: 16px; }
.sheet { width: 100%; max-width: 440px; max-height: calc(100vh - 32px); overflow: auto; }
.table td, .table th { padding: 6px 8px; }
.strong td { font-weight: 700; }
.total td { border-bottom: 0; font-size: 1.05rem; }
.lead { color: var(--ok); }
</style>
