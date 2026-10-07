<script setup>
// Elenco di parole (es. compagnie aeree) come chip, con suggerimenti.
import { computed, ref } from 'vue'

const model = defineModel({ type: Array, default: () => [] })
const props = defineProps({
  suggestions: { type: Array, default: () => [] },
  placeholder: { type: String, default: '' },
  label: { type: String, default: '' },
})
const q = ref('')
const listId = `tags-${Math.random().toString(36).slice(2, 8)}`
const options = computed(() => props.suggestions.filter((s) => !model.value.some((m) => m.toLowerCase() === s.toLowerCase())))

function add() {
  const v = q.value.trim().replace(/,$/, '').trim()
  if (v && !model.value.some((m) => m.toLowerCase() === v.toLowerCase()) && model.value.length < 20) model.value = [...model.value, v]
  q.value = ''
}
function onKey(e) {
  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() }
  else if (e.key === 'Backspace' && !q.value && model.value.length) model.value = model.value.slice(0, -1)
}
function onInput() {
  // scelta da <datalist>: il valore coincide con un suggerimento
  if (props.suggestions.some((s) => s === q.value)) add()
}
</script>

<template>
  <div class="box" @click="$refs.inp.focus()">
    <span v-for="t in model" :key="t" class="chip">
      {{ t }}
      <button type="button" class="x" :aria-label="`Togli ${t}`" @click.stop="model = model.filter((x) => x !== t)">×</button>
    </span>
    <input ref="inp" v-model="q" class="raw" :list="listId" :placeholder="model.length ? '' : placeholder" :aria-label="label || placeholder" @keydown="onKey" @input="onInput" @blur="add" />
    <datalist :id="listId">
      <option v-for="s in options" :key="s" :value="s" />
    </datalist>
  </div>
</template>

<style scoped>
.box { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; min-height: 42px; padding: 5px 8px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); cursor: text; }
.box:focus-within { outline: 2px solid var(--primary); outline-offset: 1px; }
.chip { display: inline-flex; align-items: center; gap: 2px; padding: 2px 4px 2px 9px; border-radius: 999px; background: var(--surface-2); font-size: .88rem; }
.x { border: 0; background: none; color: var(--muted); font-size: 1.1rem; line-height: 1; cursor: pointer; padding: 0 4px; }
.raw { flex: 1; min-width: 110px; border: 0; outline: 0; background: transparent; color: var(--text); font: inherit; padding: 4px 2px; }
</style>
