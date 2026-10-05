<script setup>
// Riclassificazione in blocco: trova i movimenti la cui descrizione contiene un testo,
// filtra per categoria, seleziona tutto o singolarmente e assegna categoria principale/secondaria,
// oppure sposta/copia la selezione in un altro spazio.
import { computed, onMounted, ref, watch } from 'vue'
import { toast, useSpace } from '@shared'
import {
  addCategoria, assignPrincipale, deleteMany, spaceIcon, spaceLabel, tipoOf, transferMovimenti, updateMany, useData,
} from '../store.js'
import { inRange, fmtShortDate, rangeLabel } from '../lib/period.js'
import { fmtMoney } from '../lib/money.js'
import MovRow from '../components/MovRow.vue'

const { spaceId, canWrite } = useSpace()
const { state, movimenti, catUscita, catEntrata, secondarie, writableSpaces, catById, range, span, anchor, load } = useData()
onMounted(load)

const q = ref('')
const fCat = ref('') // '' · 'none' · id
const fSub = ref('')
const fTipo = ref('')
const onlyPeriod = ref(false)

const filtered = computed(() => {
  const s = q.value.trim().toLowerCase()
  return movimenti.value.filter((m) =>
    (!s || m.descrizione.toLowerCase().includes(s)) &&
    (!fCat.value || (fCat.value === 'none' ? !m.categoria_id : m.categoria_id === fCat.value)) &&
    (!fSub.value || (fSub.value === 'none' ? !m.sottocategoria_id : m.sottocategoria_id === fSub.value)) &&
    (!fTipo.value || (fTipo.value === 'out' ? m.importo < 0 : m.importo > 0)) &&
    (!onlyPeriod.value || inRange(m.data, range.value)),
  )
})
const sumFiltered = computed(() => filtered.value.reduce((a, m) => a + (m.valuta === 'EUR' ? Number(m.importo) : 0), 0))

/* ---------- selezione ---------- */

const selected = ref(new Set())
const limit = ref(200)
watch(filtered, (list) => {
  limit.value = 200
  // la selezione resta solo sulle righe ancora visibili
  const ids = new Set(list.map((m) => m.id))
  const next = new Set([...selected.value].filter((id) => ids.has(id)))
  if (next.size !== selected.value.size) selected.value = next
})
const allSelected = computed(() => filtered.value.length > 0 && filtered.value.every((m) => selected.value.has(m.id)))
function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(filtered.value.map((m) => m.id))
}
function toggle(id) {
  const s = new Set(selected.value)
  s.has(id) ? s.delete(id) : s.add(id)
  selected.value = s
}
const selRows = computed(() => filtered.value.filter((m) => selected.value.has(m.id)))
const selSum = computed(() => selRows.value.reduce((a, m) => a + (m.valuta === 'EUR' ? Number(m.importo) : 0), 0))

/* ---------- parole frequenti (suggerimenti di ricerca) ---------- */

const STOP = new Set(('pagamento pag pos carta del della dello delle dei di da con per presso ore operazione acquisto addebito sdd bonifico favore '
  + 'mastercard visa debit credit eur euro data valuta rif num nr srl spa snc the and www com http https online sepa disposizione').split(' '))
const suggestions = computed(() => {
  const base = movimenti.value.filter((m) => (fCat.value ? (fCat.value === 'none' ? !m.categoria_id : m.categoria_id === fCat.value) : !m.categoria_id))
  const count = new Map()
  for (const m of base) {
    const words = new Set(m.descrizione.toLowerCase().replace(/[^a-zà-ÿ\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w)))
    for (const w of words) count.set(w, (count.get(w) ?? 0) + 1)
  }
  return [...count.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 14)
})

/* ---------- azioni ---------- */

const busy = ref(false)
const setCat = ref('')
const setSub = ref('')
const moveTo = ref('')
const otherSpaces = computed(() => writableSpaces.value.filter((s) => s.id !== spaceId.value))

async function resolve(value, gruppo) {
  if (value !== '__new') return value || null
  const nome = prompt('Nome della nuova categoria secondaria')?.trim()
  if (!nome) return undefined
  return addCategoria(nome, gruppo)
}
// Tipi presenti nella selezione: la categoria principale si sceglie tra quelle del tipo giusto.
const selTipi = computed(() => new Set(selRows.value.map((m) => tipoOf(m.importo))))
const mixed = computed(() => selTipi.value.size > 1)

async function run(fn, done) {
  if (!selected.value.size || busy.value) return
  busy.value = true
  try {
    await fn()
    toast.ok(done)
    selected.value = new Set()
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}

/** setCat contiene il nome della categoria: uscite ed entrate ricevono quella del proprio tipo. */
async function applyCat() {
  let nome = setCat.value
  if (nome === '__new') {
    nome = prompt(mixed.value ? 'Nome della nuova categoria (creata sia tra le uscite sia tra le entrate)' : 'Nome della nuova categoria')?.trim()
    if (!nome) return
  }
  if (nome === '__none') nome = ''
  const n = selected.value.size
  await run(() => assignPrincipale(selRows.value, nome), `Categoria ${nome ? `«${nome}»` : 'rimossa'} su ${n} movimenti`)
  setCat.value = ''
}
async function applySub() {
  const id = setSub.value === '__none' ? null : await resolve(setSub.value, 'secondaria')
  if (id === undefined) return
  const n = selected.value.size
  await run(() => updateMany([...selected.value], { sottocategoria_id: id }), `Categoria secondaria ${id ? `«${catById.value.get(id)?.nome}»` : 'rimossa'} su ${n} movimenti`)
  setSub.value = ''
}
async function transfer(copy) {
  const target = otherSpaces.value.find((s) => s.id === moveTo.value)
  if (!target) return
  const n = selected.value.size
  const verb = copy ? 'Copiare' : 'Spostare'
  if (!confirm(`${verb} ${n} movimenti in «${spaceLabel(target)}»? Le categorie mancanti verranno create lì.`)) return
  await run(() => transferMovimenti(selRows.value, target.id, { copy }), `${n} movimenti ${copy ? 'copiati' : 'spostati'} in «${spaceLabel(target)}»`)
}
async function remove() {
  const n = selected.value.size
  if (!confirm(`Eliminare definitivamente ${n} movimenti?`)) return
  await run(() => deleteMany([...selected.value]), `${n} movimenti eliminati`)
}
</script>

<template>
  <div class="stack" style="gap: 14px">
    <section class="card stack">
      <label class="field">
        <span>La descrizione contiene</span>
        <input v-model="q" class="input" type="search" placeholder="es. esselunga, amazon, affitto" autocomplete="off" />
      </label>
      <div v-if="!q && suggestions.length" class="sugg">
        <span class="muted small">Ricorrenti {{ fCat ? 'nel filtro' : 'senza categoria' }}:</span>
        <button v-for="[w, n] in suggestions" :key="w" class="chip" @click="q = w">{{ w }} <span class="muted">{{ n }}</span></button>
      </div>
      <div class="filters">
        <select v-model="fCat" class="select" aria-label="Categoria principale">
          <option value="">Ogni categoria</option>
          <option value="none">Senza categoria</option>
          <optgroup v-if="catUscita.length" label="Uscite">
            <option v-for="c in catUscita" :key="c.id" :value="c.id">{{ c.nome }}</option>
          </optgroup>
          <optgroup v-if="catEntrata.length" label="Entrate">
            <option v-for="c in catEntrata" :key="c.id" :value="c.id">{{ c.nome }}</option>
          </optgroup>
        </select>
        <select v-model="fSub" class="select" aria-label="Categoria secondaria">
          <option value="">Ogni secondaria</option>
          <option value="none">Senza secondaria</option>
          <option v-for="c in secondarie" :key="c.id" :value="c.id">{{ c.nome }}</option>
        </select>
        <select v-model="fTipo" class="select" aria-label="Tipo">
          <option value="">Entrate e uscite</option>
          <option value="out">Solo uscite</option>
          <option value="in">Solo entrate</option>
        </select>
        <label class="check">
          <input v-model="onlyPeriod" type="checkbox" />
          <span>Solo {{ span === 'all' ? 'periodo' : rangeLabel(span, anchor).toLowerCase() }}</span>
        </label>
      </div>
    </section>

    <div v-if="state.loading && !state.loaded" class="card empty"><div class="spinner" style="margin: 0 auto" /></div>
    <div v-else-if="!filtered.length" class="card empty">Nessun movimento corrisponde.</div>

    <section v-else class="card list">
      <div class="list-head">
        <label v-if="canWrite" class="check">
          <input type="checkbox" :checked="allSelected" :indeterminate="selected.size > 0 && !allSelected" @change="toggleAll" />
          <span>{{ allSelected ? 'Deseleziona' : 'Seleziona' }} tutti ({{ filtered.length }})</span>
        </label>
        <span v-else class="small">{{ filtered.length }} movimenti</span>
        <span class="muted small">{{ fmtMoney(sumFiltered, 'EUR', { sign: true }) }}</span>
      </div>
      <label v-for="m in filtered.slice(0, limit)" :key="m.id" class="item" :class="{ sel: selected.has(m.id) }">
        <input v-if="canWrite" type="checkbox" :checked="selected.has(m.id)" @change="toggle(m.id)" />
        <MovRow :m="m" :highlight="q" :show-date="fmtShortDate(m.data)" />
      </label>
      <button v-if="filtered.length > limit" class="btn btn-sm more" @click="limit += 500">Mostra altri ({{ filtered.length - limit }})</button>
    </section>

    <div v-if="canWrite && selected.size" class="actions-pad" />
    <section v-if="canWrite && selected.size" class="actions card" aria-label="Azioni sulla selezione">
      <div class="row-between">
        <strong>{{ selected.size }} selezionati</strong>
        <span class="muted small">{{ fmtMoney(selSum, 'EUR', { sign: true }) }}</span>
        <button class="btn btn-ghost btn-sm" @click="selected = new Set()">Annulla</button>
      </div>
      <div class="act">
        <select v-model="setCat" class="select" aria-label="Nuova categoria principale">
          <option value="" disabled>Categoria {{ mixed ? 'principale' : selTipi.has('entrata') ? 'di entrata' : 'di uscita' }}…</option>
          <optgroup v-if="selTipi.has('uscita') && catUscita.length" :label="mixed ? 'Uscite' : 'Categorie di uscita'">
            <option v-for="c in catUscita" :key="c.id" :value="c.nome">{{ c.nome }}</option>
          </optgroup>
          <optgroup v-if="selTipi.has('entrata') && catEntrata.length" :label="mixed ? 'Entrate' : 'Categorie di entrata'">
            <option v-for="c in catEntrata" :key="'e' + c.id" :value="c.nome">{{ c.nome }}</option>
          </optgroup>
          <option value="__new">＋ Nuova categoria…</option>
          <option value="__none">— Rimuovi categoria</option>
        </select>
        <button class="btn btn-primary btn-sm" :disabled="!setCat || busy" @click="applyCat">Applica</button>
      </div>
      <p v-if="mixed" class="muted small" style="margin: 0">
        Selezione con uscite ed entrate: ognuna riceve la categoria del proprio tipo con quel nome (creata se manca).
      </p>
      <div class="act">
        <select v-model="setSub" class="select" aria-label="Nuova categoria secondaria">
          <option value="" disabled>Categoria secondaria…</option>
          <option v-for="c in secondarie" :key="c.id" :value="c.id">{{ c.nome }}</option>
          <option value="__new">＋ Nuova secondaria…</option>
          <option value="__none">— Rimuovi secondaria</option>
        </select>
        <button class="btn btn-primary btn-sm" :disabled="!setSub || busy" @click="applySub">Applica</button>
      </div>
      <div v-if="otherSpaces.length" class="act">
        <select v-model="moveTo" class="select" aria-label="Altro spazio">
          <option value="" disabled>Sposta o copia in…</option>
          <option v-for="s in otherSpaces" :key="s.id" :value="s.id">{{ spaceIcon(s) }} {{ spaceLabel(s) }}</option>
        </select>
        <button class="btn btn-sm" :disabled="!moveTo || busy" @click="transfer(false)">Sposta</button>
        <button class="btn btn-sm" :disabled="!moveTo || busy" @click="transfer(true)">Copia</button>
      </div>
      <button class="btn btn-ghost btn-sm btn-danger" style="align-self: flex-start" :disabled="busy" @click="remove">Elimina selezionati</button>
    </section>
  </div>
</template>

<style scoped>
.filters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) auto; gap: 8px; align-items: center; }
@media (max-width: 640px) { .filters { grid-template-columns: 1fr 1fr; } }
.check { display: inline-flex; align-items: center; gap: 8px; font-size: .9rem; cursor: pointer; }
.check input, .item input { width: 18px; height: 18px; accent-color: var(--primary); flex-shrink: 0; }
.sugg { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.chip { padding: 4px 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font: inherit; font-size: .85rem; cursor: pointer; }
.chip:hover { background: var(--surface-2); }
.list { padding: 0 12px; }
.list-head { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border); position: sticky; top: 52px; background: var(--surface); z-index: 2; }
.item { display: flex; align-items: center; gap: 10px; cursor: pointer; min-width: 0; }
.item > :last-child { flex: 1; min-width: 0; }
.item + .item { border-top: 1px solid var(--border); }
.item.sel { background: color-mix(in srgb, var(--primary-soft) 70%, transparent); margin: 0 -12px; padding: 0 12px; }
.more { margin: 10px auto; display: flex; }
.actions-pad { height: 200px; }
.actions {
  position: fixed; z-index: 25; left: 50%; transform: translateX(-50%); bottom: max(12px, env(safe-area-inset-bottom));
  width: min(640px, calc(100% - 24px)); display: flex; flex-direction: column; gap: 8px; padding: 12px;
  box-shadow: 0 8px 30px rgb(0 0 0 / .25);
}
.act { display: flex; gap: 6px; align-items: center; }
.act .select { flex: 1; min-width: 0; padding: 6px 9px; }
</style>
