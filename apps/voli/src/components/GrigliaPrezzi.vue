<script setup>
// Calendario dei prezzi: una riga per data di andata, una colonna per durata; in ogni cella il prezzo migliore.
// Colori dal più economico (verde) al più caro (rosso). Un clic su una cella mostra quei voli.
import { computed } from 'vue'
import { perCella } from '../lib/combina.js'
import { giorno, prezzoTondo } from '../lib/formato.js'

const props = defineProps({
  soluzioni: { type: Array, required: true },
  date: { type: Array, required: true }, // date di andata da mostrare
  durate: { type: Array, required: true }, // [null] per la sola andata
})
const emit = defineEmits(['select'])

const celle = computed(() => perCella(props.soluzioni))
const range = computed(() => {
  const p = [...celle.value.values()].map((s) => s.prezzo)
  return p.length ? [Math.min(...p), Math.max(...p)] : [0, 0]
})
function cella(data, dur) {
  return celle.value.get(`${data}|${dur ?? 0}`) ?? null
}
function livello(s) {
  if (!s) return ''
  const [a, b] = range.value
  const t = b > a ? (s.prezzo - a) / (b - a) : 0
  return t <= 0.001 ? 'l0' : t < 0.25 ? 'l1' : t < 0.5 ? 'l2' : t < 0.75 ? 'l3' : 'l4'
}
const righe = computed(() => props.date.filter((d) => props.durate.some((x) => cella(d, x))))
</script>

<template>
  <div v-if="!righe.length" class="card empty">Nessun prezzo nel calendario con questi filtri.</div>
  <div v-else class="card wrap">
    <div class="table-wrap">
      <table class="grid-p">
        <thead>
          <tr>
            <th>Andata</th>
            <th v-for="d in durate" :key="d ?? 0" class="num">{{ d == null ? 'Prezzo' : `${d} gg` }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="data in righe" :key="data">
            <th scope="row">{{ giorno(data) }}</th>
            <td v-for="d in durate" :key="d ?? 0" class="num">
              <button
                v-if="cella(data, d)" type="button" class="c" :class="livello(cella(data, d))"
                :title="`${cella(data, d).compagnie} · ${cella(data, d).origine}→${cella(data, d).destinazione}`"
                @click="emit('select', { data, durata: d })"
              >{{ prezzoTondo(cella(data, d).prezzo) }}</button>
              <span v-else class="muted">·</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="muted small legend">
      <span class="c l0">min</span> <span class="c l1">&nbsp;</span> <span class="c l2">&nbsp;</span> <span class="c l3">&nbsp;</span> <span class="c l4">max</span>
      Tocca un prezzo per vedere i voli.
    </p>
  </div>
</template>

<style scoped>
.wrap { padding: 8px; }
.grid-p { border-collapse: separate; border-spacing: 3px; width: 100%; }
.grid-p th { font-size: .78rem; color: var(--muted); font-weight: 600; text-align: left; white-space: nowrap; padding: 2px 6px; }
.grid-p th.num, .grid-p td.num { text-align: center; }
.grid-p tbody th { color: var(--text); font-weight: 500; font-size: .85rem; }
.c { display: inline-block; min-width: 56px; padding: 6px 6px; border-radius: 8px; border: 0; font: inherit; font-size: .88rem; font-weight: 600; font-variant-numeric: tabular-nums; cursor: pointer; color: var(--text); background: var(--surface-2); }
.c.l0 { background: color-mix(in srgb, var(--ok) 42%, var(--surface)); }
.c.l1 { background: color-mix(in srgb, var(--ok) 22%, var(--surface)); }
.c.l2 { background: color-mix(in srgb, var(--warn) 14%, var(--surface)); }
.c.l3 { background: color-mix(in srgb, var(--warn) 30%, var(--surface)); }
.c.l4 { background: color-mix(in srgb, var(--danger) 26%, var(--surface)); }
.c:hover { outline: 2px solid var(--primary); }
.legend { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin: 8px 4px 2px; }
.legend .c { min-width: 28px; padding: 2px 6px; font-size: .72rem; cursor: default; }
.legend .c:hover { outline: 0; }
</style>
