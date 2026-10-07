<script setup>
// Elenco di aeroporti (codici IATA) come chip, con suggerimenti per codice, città o paese.
// Si può aggiungere anche un codice di 3 lettere che non è nell'elenco.
import { computed, ref } from 'vue'
import aeroporti from '../lib/aeroporti.js'
import { nomeAeroporto } from '../lib/formato.js'

const model = defineModel({ type: Array, default: () => [] })
defineProps({ placeholder: { type: String, default: 'Città o codice (es. BLQ)' }, label: { type: String, default: '' } })

const q = ref('')
const open = ref(false)
const active = ref(0)
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const suggestions = computed(() => {
  const t = norm(q.value.trim())
  if (!t) return []
  const out = []
  for (const [c, n, p] of aeroporti) {
    if (model.value.includes(c)) continue
    const score = c.toLowerCase() === t ? 0 : c.toLowerCase().startsWith(t) ? 1 : norm(n).startsWith(t) ? 2 : norm(n).includes(t) ? 3 : norm(p).startsWith(t) ? 4 : -1
    if (score >= 0) out.push({ c, n, p, score })
  }
  out.sort((a, b) => a.score - b.score || a.n.localeCompare(b.n, 'it'))
  return out.slice(0, 8)
})

function add(code) {
  const c = code.toUpperCase()
  if (!/^[A-Z]{3}$/.test(c) || model.value.includes(c) || model.value.length >= 10) return
  model.value = [...model.value, c]
  q.value = ''
  active.value = 0
}
const remove = (c) => { model.value = model.value.filter((x) => x !== c) }
// chiusura ritardata: il clic su un suggerimento arriva dopo il blur
const onBlur = () => window.setTimeout(() => { open.value = false }, 150)

function onKey(e) {
  if (e.key === 'ArrowDown') { active.value = Math.min(active.value + 1, suggestions.value.length - 1); e.preventDefault() }
  else if (e.key === 'ArrowUp') { active.value = Math.max(active.value - 1, 0); e.preventDefault() }
  else if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    const s = suggestions.value[active.value]
    if (s) add(s.c)
    else if (/^[a-z]{3}$/i.test(q.value.trim())) add(q.value.trim())
  } else if (e.key === 'Backspace' && !q.value && model.value.length) remove(model.value.at(-1))
}
</script>

<template>
  <div class="ai">
    <div class="box" @click="$refs.inp.focus()">
      <span v-for="c in model" :key="c" class="chip" :title="nomeAeroporto(c)">
        <strong>{{ c }}</strong> <span class="muted small">{{ nomeAeroporto(c) !== c ? nomeAeroporto(c) : '' }}</span>
        <button type="button" class="x" :aria-label="`Togli ${c}`" @click.stop="remove(c)">×</button>
      </span>
      <input
        ref="inp" v-model="q" class="raw" :placeholder="model.length ? '' : placeholder" :aria-label="label || placeholder"
        autocomplete="off" @keydown="onKey" @focus="open = true" @blur="onBlur" @input="active = 0"
      />
    </div>
    <ul v-if="open && suggestions.length" class="menu" role="listbox">
      <li v-for="(s, i) in suggestions" :key="s.c" role="option" :aria-selected="i === active" :class="{ on: i === active }" @mousedown.prevent="add(s.c)">
        <strong>{{ s.c }}</strong> {{ s.n }} <span class="muted small">{{ s.p }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.ai { position: relative; }
.box { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; min-height: 42px; padding: 5px 8px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); cursor: text; }
.box:focus-within { outline: 2px solid var(--primary); outline-offset: 1px; }
.chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 4px 2px 8px; border-radius: 999px; background: var(--primary-soft); color: var(--text); font-size: .88rem; max-width: 100%; }
.chip .muted { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 130px; }
.x { border: 0; background: none; color: var(--muted); font-size: 1.1rem; line-height: 1; cursor: pointer; padding: 0 4px; }
.raw { flex: 1; min-width: 90px; border: 0; outline: 0; background: transparent; color: var(--text); font: inherit; padding: 4px 2px; }
.menu { position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 4px); margin: 0; padding: 4px; list-style: none; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); max-height: 280px; overflow-y: auto; }
.menu li { padding: 7px 9px; border-radius: 8px; cursor: pointer; }
.menu li.on, .menu li:hover { background: var(--surface-2); }
</style>
