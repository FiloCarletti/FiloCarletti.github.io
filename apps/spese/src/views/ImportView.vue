<script setup>
// Import CSV: anteprima, categorie nuove, duplicati, scelta dello spazio di destinazione.
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { supabase, unwrap, toast, useSpace } from '@shared'
import { T } from '../db.js'
import { categorieOf, ensureCategorie, insertMovimenti, lookupCat, spaceIcon, spaceLabel, useData } from '../store.js'
import { dupKey, readMovimenti } from '../lib/csv.js'
import { fmtShortDate } from '../lib/period.js'
import { fmtMoney } from '../lib/money.js'

const router = useRouter()
const { spaceId } = useSpace()
const { state, writableSpaces, defaultTarget, spaceById, load } = useData()
onMounted(load)

const fileName = ref('')
const text = ref('')
const parsed = ref(null) // { rows, errors, header }
const target = ref(defaultTarget.value)
const skipDup = ref(true)
const busy = ref(false)
const progress = ref(0)

async function onFile(e) {
  const f = e.target.files?.[0]
  if (!f) return
  fileName.value = f.name
  text.value = await f.text()
  parse()
}
function parse() {
  parsed.value = text.value.trim() ? readMovimenti(text.value) : null
}

/* ---------- confronto con lo spazio di destinazione ---------- */

const targetKeys = ref(new Map()) // chiave duplicato → quante volte esiste già
const targetCats = ref([])
const checking = ref(false)
watch(target, async (sid) => {
  if (!sid) return
  checking.value = true
  try {
    targetCats.value = await categorieOf(sid)
    let rows
    if (sid === spaceId.value) {
      await load()
      rows = state.movimenti
    } else {
      rows = []
      for (let from = 0; ; from += 1000) {
        const part = unwrap(await supabase.from(T.movimenti).select('data, importo, descrizione, conto').eq('space_id', sid).order('id').range(from, from + 999))
        rows.push(...part)
        if (part.length < 1000) break
      }
    }
    const map = new Map()
    for (const m of rows) map.set(dupKey(m), (map.get(dupKey(m)) ?? 0) + 1)
    targetKeys.value = map
  } catch (e) {
    toast.error(e)
  } finally {
    checking.value = false
  }
}, { immediate: true })

/** Righe con flag "dup": una riga è duplicata se ne esistono già altrettante identiche nello spazio. */
const rows = computed(() => {
  if (!parsed.value) return []
  const seen = new Map()
  return parsed.value.rows.map((r) => {
    const k = dupKey(r)
    const n = (seen.get(k) ?? 0) + 1
    seen.set(k, n)
    return { ...r, dup: n <= (targetKeys.value.get(k) ?? 0) }
  })
})
const dups = computed(() => rows.value.filter((r) => r.dup).length)
const toImport = computed(() => rows.value.filter((r) => !(skipDup.value && r.dup)))
const summary = computed(() => {
  let entrate = 0, uscite = 0, min = null, max = null
  for (const r of toImport.value) {
    if (r.importo > 0) entrate += r.importo
    else uscite -= r.importo
    if (!min || r.data < min) min = r.data
    if (!max || r.data > max) max = r.data
  }
  return { entrate, uscite, min, max }
})
const newCats = computed(() => {
  const have = new Set(targetCats.value.filter((c) => c.livello === 'principale').map((c) => c.nome.toLowerCase()))
  const out = new Map()
  for (const r of toImport.value) {
    if (r.categoria && !have.has(r.categoria.toLowerCase())) out.set(r.categoria.toLowerCase(), r.categoria)
  }
  return [...out.values()]
})
const uncategorized = computed(() => toImport.value.filter((r) => !r.categoria).length)
const targetSpace = computed(() => spaceById(target.value))
const elsewhere = computed(() => target.value !== spaceId.value)

async function run() {
  if (!toImport.value.length || busy.value) return
  busy.value = true
  progress.value = 0
  try {
    const sid = target.value
    const map = await ensureCategorie(sid, toImport.value.map((r) => ({ livello: 'principale', nome: r.categoria })))
    const payload = toImport.value.map((r) => ({
      data: r.data, conto: r.conto, importo: r.importo, valuta: r.valuta, descrizione: r.descrizione,
      categoria_id: lookupCat(map, 'principale', r.categoria),
    }))
    await insertMovimenti(sid, payload, (n) => { progress.value = n })
    toast.ok(`${payload.length} movimenti importati in «${spaceLabel(targetSpace.value)}»`)
    if (elsewhere.value) {
      parsed.value = null
      text.value = ''
      fileName.value = ''
    } else {
      router.push('/')
    }
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="stack" style="gap: 14px">
    <section class="card stack">
      <div>
        <h3 style="margin: 0">Importa da CSV</h3>
        <p class="muted small" style="margin: 2px 0 0">
          Colonne: <code>date, account, category, amount, currency, description</code> (con intestazione, anche in italiano, o in quest'ordine).
          <code>amount</code> negativo = uscita, positivo = entrata. Separatore virgola, punto e virgola o tab; date AAAA-MM-GG o GG/MM/AAAA.
        </p>
      </div>
      <label class="drop">
        <input type="file" accept=".csv,text/csv,text/plain" @change="onFile" />
        <span>📄 {{ fileName || 'Scegli un file CSV' }}</span>
      </label>
      <details>
        <summary class="small muted">…oppure incolla il testo</summary>
        <textarea v-model="text" class="textarea mono" placeholder="date,account,category,amount,currency,description&#10;2026-10-01,Carta,Spesa,-42.50,EUR,Supermercato" @input="parse" />
      </details>
    </section>

    <section v-if="writableSpaces.length > 1" class="card stack">
      <span class="label">Importa nello spazio</span>
      <div class="chips">
        <button v-for="s in writableSpaces" :key="s.id" class="chip" :class="{ on: target === s.id }" :aria-pressed="target === s.id" @click="target = s.id">
          {{ spaceIcon(s) }} {{ spaceLabel(s) }}
        </button>
      </div>
      <p v-if="elsewhere" class="notice small">
        I movimenti andranno in <strong>«{{ spaceLabel(targetSpace) }}»</strong>, non nello spazio che stai guardando.
      </p>
    </section>

    <template v-if="parsed">
      <section class="card stack">
        <div class="row-between">
          <h3 style="margin: 0">Anteprima</h3>
          <span v-if="checking" class="muted small">Controllo duplicati…</span>
        </div>
        <div class="stats">
          <div><span class="muted small">Da importare</span><strong>{{ toImport.length }}</strong></div>
          <div><span class="muted small">Entrate</span><strong class="in">{{ fmtMoney(summary.entrate) }}</strong></div>
          <div><span class="muted small">Uscite</span><strong class="out">{{ fmtMoney(summary.uscite) }}</strong></div>
          <div v-if="summary.min"><span class="muted small">Periodo</span><strong class="small">{{ fmtShortDate(summary.min) }} – {{ fmtShortDate(summary.max) }}</strong></div>
        </div>
        <label v-if="dups" class="check">
          <input v-model="skipDup" type="checkbox" />
          <span>Salta {{ dups }} {{ dups === 1 ? 'movimento già presente' : 'movimenti già presenti' }} (stessa data, importo, descrizione e conto)</span>
        </label>
        <p v-if="newCats.length" class="small" style="margin: 0">
          <strong>{{ newCats.length === 1 ? '1 categoria nuova' : `${newCats.length} categorie nuove` }}</strong> {{ newCats.length === 1 ? 'verrà creata' : 'verranno create' }}: <span class="muted">{{ newCats.join(', ') }}</span>
        </p>
        <p v-if="uncategorized" class="small muted" style="margin: 0">{{ uncategorized }} senza categoria: potrai assegnarla da Riclassifica.</p>
        <details v-if="parsed.errors.length">
          <summary class="small error-text">{{ parsed.errors.length === 1 ? '1 riga saltata' : `${parsed.errors.length} righe saltate` }}</summary>
          <ul class="small errors">
            <li v-for="e in parsed.errors.slice(0, 50)" :key="e.line">Riga {{ e.line }}: {{ e.msg }}</li>
          </ul>
        </details>

        <div class="table-wrap">
          <table class="table small">
            <thead><tr><th>Data</th><th>Descrizione</th><th>Categoria</th><th class="hide-xs">Conto</th><th class="num">Importo</th></tr></thead>
            <tbody>
              <tr v-for="r in rows.slice(0, 30)" :key="r.line" :class="{ dup: r.dup && skipDup }">
                <td style="white-space: nowrap">{{ fmtShortDate(r.data) }}</td>
                <td>{{ r.descrizione }}<span v-if="r.dup" class="badge" style="margin-left: 4px">già presente</span></td>
                <td>{{ r.categoria || '—' }}</td>
                <td class="hide-xs">{{ r.conto }}</td>
                <td class="num" :class="r.importo < 0 ? 'out' : 'in'" style="white-space: nowrap">{{ fmtMoney(r.importo, r.valuta) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="rows.length > 30" class="muted small" style="margin: 0">… e altre {{ rows.length - 30 }} righe</p>

        <div class="row">
          <button class="btn btn-primary" :disabled="!toImport.length || busy || checking || !target" @click="run">
            {{ busy ? `Importo… ${progress}/${toImport.length}` : `Importa ${toImport.length} movimenti` }}
          </button>
          <span class="muted small">in {{ spaceIcon(targetSpace) }} {{ spaceLabel(targetSpace) }}</span>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.drop { display: flex; align-items: center; justify-content: center; padding: 22px 12px; border: 2px dashed var(--border); border-radius: var(--radius-lg); cursor: pointer; text-align: center; font-weight: 500; }
.drop:hover { border-color: var(--primary); }
.drop input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.mono { font-family: var(--mono); font-size: .82rem; margin-top: 6px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { padding: 7px 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font: inherit; cursor: pointer; }
.chip.on { border-color: var(--primary); background: var(--primary-soft); font-weight: 600; }
.notice { margin: 0; padding: 8px 10px; border-radius: var(--radius); background: color-mix(in srgb, var(--warn) 14%, var(--surface)); }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; }
.stats > div { display: flex; flex-direction: column; }
.in { color: var(--ok); }
.out { color: var(--danger); }
.check { display: flex; align-items: flex-start; gap: 8px; font-size: .9rem; cursor: pointer; }
.check input { margin-top: 3px; accent-color: var(--primary); }
.errors { margin: 6px 0 0; padding-left: 18px; color: var(--muted); }
@media (max-width: 520px) { .hide-xs { display: none; } }
tr.dup td { opacity: .45; text-decoration: line-through; }
</style>
