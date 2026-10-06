<script setup>
// Registro delle ricerche (per controllare la routine), quante righe occupa ogni tabella e la pulizia
// dei dati non fondamentali: offerte scadute, storico vecchio, registro vecchio. Supermercati e prodotti restano.
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { fmtDateTime, supabase, toast, unwrap, useSpace } from '@shared'
import { T } from '../db.js'
import { reload } from '../store.js'
import { addDays, parseISO, toISO, today } from '../lib/dates.js'

const { spaceId, canWrite } = useSpace()

/* ---------- registro delle ricerche ---------- */

const ricerche = ref([])
const loadingRicerche = ref(true)
async function loadRicerche() {
  try {
    ricerche.value = unwrap(await supabase.from(T.ricerche).select('*').eq('space_id', spaceId.value)
      .order('created_at', { ascending: false }).limit(20))
  } catch (e) {
    toast.error(e)
  } finally {
    loadingRicerche.value = false
  }
}
const FONTI = { claude: 'Claude', json: 'JSON', manuale: 'a mano' }
const ultimaAuto = computed(() => ricerche.value.find((r) => r.fonte === 'claude'))
const oreFa = (ts) => Math.round((Date.now() - new Date(ts).getTime()) / 3600e3)

/* ---------- righe per tabella e pulizia ---------- */

const keep = reactive({ offerte: 30, storico: 12, ricerche: 90 })
const counts = reactive({})
const toDelete = reactive({ offerte: null, storico: null, ricerche: null })

const count = (table, filter = (q) => q) =>
  filter(supabase.from(table).select('id', { count: 'exact', head: true }).eq('space_id', spaceId.value))
    .then(({ count: n, error }) => { if (error) throw error; return n })

const monthsAgo = (n) => { const d = parseISO(today()); d.setMonth(d.getMonth() - n); return toISO(d) }
const limits = () => ({
  offerte: addDays(today(), -Math.max(0, keep.offerte | 0)),
  storico: monthsAgo(Math.max(0, keep.storico | 0)),
  ricerche: new Date(Date.now() - Math.max(0, keep.ricerche | 0) * 864e5).toISOString(),
})

async function loadCounts() {
  try {
    const t = today()
    const [supermercati, prodotti, attive, scadute, storico, ric] = await Promise.all([
      count(T.supermercati), count(T.prodotti),
      count(T.offerte, (q) => q.gte('valido_fino', t)), count(T.offerte, (q) => q.lt('valido_fino', t)),
      count(T.storico), count(T.ricerche),
    ])
    Object.assign(counts, { supermercati, prodotti, attive, scadute, storico, ricerche: ric })
    await loadToDelete()
  } catch (e) {
    toast.error(e)
  }
}
async function loadToDelete() {
  const l = limits()
  const [o, s, r] = await Promise.all([
    count(T.offerte, (q) => q.lt('valido_fino', l.offerte)),
    count(T.storico, (q) => q.lt('valido_fino', l.storico)),
    count(T.ricerche, (q) => q.lt('created_at', l.ricerche)),
  ])
  Object.assign(toDelete, { offerte: o, storico: s, ricerche: r })
}
let timer = null
watch(keep, () => {
  clearTimeout(timer)
  timer = setTimeout(() => loadToDelete().catch(toast.error), 350)
})

const busy = ref('')
const PARAM = { offerte: 'p_giorni_offerte', storico: 'p_mesi_storico', ricerche: 'p_giorni_ricerche' }
const WHAT = {
  offerte: () => `le offerte scadute da più di ${keep.offerte} giorni (il prezzo resta nello storico)`,
  storico: () => `lo storico prezzi più vecchio di ${keep.storico} mesi`,
  ricerche: () => `il registro delle ricerche più vecchio di ${keep.ricerche} giorni`,
}
async function pulisci(kind) {
  if (!confirm(`Eliminare ${WHAT[kind]()}? ${toDelete[kind]} righe.`)) return
  busy.value = kind
  try {
    const res = unwrap(await supabase.rpc('offerte_pulisci', { p_space_id: spaceId.value, [PARAM[kind]]: Math.max(0, keep[kind] | 0) }))
    toast.ok(`Eliminate ${res[kind]} righe`)
    await Promise.all([loadCounts(), kind === 'ricerche' ? loadRicerche() : null, kind === 'offerte' ? reload() : null])
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = ''
  }
}

onMounted(() => { loadRicerche(); loadCounts() })
</script>

<template>
  <div class="stack" style="gap: 16px">
    <section class="card stack">
      <h3 style="margin: 0">Ricerche</h3>
      <p v-if="ultimaAuto" class="small" style="margin: 0">
        Ultima ricerca di Claude: <strong>{{ fmtDateTime(ultimaAuto.created_at) }}</strong>
        <span v-if="oreFa(ultimaAuto.created_at) > 36" class="badge warn">più di un giorno fa</span>
      </p>
      <p v-else-if="!loadingRicerche" class="muted small" style="margin: 0">
        Nessuna ricerca di Claude ancora. Con la routine giornaliera qui vedi ogni mattina cosa ha trovato.
      </p>
      <div v-if="loadingRicerche" class="center"><div class="spinner" /></div>
      <ul v-else-if="ricerche.length" class="log">
        <li v-for="r in ricerche" :key="r.id">
          <div class="row-between">
            <span class="small"><strong>{{ fmtDateTime(r.created_at) }}</strong> · {{ FONTI[r.fonte] }}</span>
            <span class="small nums">
              <span class="ok">+{{ r.nuove }}</span> · {{ r.aggiornate }} agg.<template v-if="r.scartate"> · <span class="ko">{{ r.scartate }} scartate</span></template>
            </span>
          </div>
          <div v-if="r.supermercati.length" class="muted small">{{ r.supermercati.join(', ') }}</div>
          <div v-if="r.note" class="small note">{{ r.note }}</div>
        </li>
      </ul>
    </section>

    <section class="card stack">
      <h3 style="margin: 0">Spazio occupato</h3>
      <p class="muted small" style="margin: 0">
        Il database è condiviso tra tutte le app e ha poco spazio: supermercati e prodotti sono piccoli e restano,
        offerte scadute, storico e registro crescono e si possono ripulire.
      </p>
      <div class="table-wrap">
        <table class="table small">
          <tbody>
            <tr><td>Supermercati</td><td class="num">{{ counts.supermercati ?? '…' }}</td><td class="muted">da tenere</td></tr>
            <tr><td>Prodotti seguiti</td><td class="num">{{ counts.prodotti ?? '…' }}</td><td class="muted">da tenere</td></tr>
            <tr><td>Offerte attive e in arrivo</td><td class="num">{{ counts.attive ?? '…' }}</td><td class="muted">si svuotano da sole alla scadenza</td></tr>
            <tr><td>Offerte scadute</td><td class="num">{{ counts.scadute ?? '…' }}</td><td class="muted">ripulibili</td></tr>
            <tr><td>Storico prezzi</td><td class="num">{{ counts.storico ?? '…' }}</td><td class="muted">ripulibile</td></tr>
            <tr><td>Registro ricerche</td><td class="num">{{ counts.ricerche ?? '…' }}</td><td class="muted">ripulibile</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="canWrite" class="card stack">
      <h3 style="margin: 0">Pulizia</h3>
      <p class="muted small" style="margin: 0">
        La routine di Claude elimina da sola, a ogni ricerca, le offerte scadute da più di 30 giorni e il registro più vecchio di 90 giorni.
        Lo storico prezzi lo pulisci tu da qui.
      </p>
      <div class="clean">
        <span>Offerte scadute da più di</span>
        <input v-model.number="keep.offerte" type="number" min="0" max="3650" class="input num-in" aria-label="Giorni" />
        <span>giorni</span>
        <button type="button" class="btn btn-sm btn-danger" :disabled="!toDelete.offerte || !!busy" @click="pulisci('offerte')">
          {{ busy === 'offerte' ? 'Elimino…' : `Elimina ${toDelete.offerte ?? '…'}` }}
        </button>
      </div>
      <div class="clean">
        <span>Storico prezzi più vecchio di</span>
        <input v-model.number="keep.storico" type="number" min="0" max="120" class="input num-in" aria-label="Mesi" />
        <span>mesi</span>
        <button type="button" class="btn btn-sm btn-danger" :disabled="!toDelete.storico || !!busy" @click="pulisci('storico')">
          {{ busy === 'storico' ? 'Elimino…' : `Elimina ${toDelete.storico ?? '…'}` }}
        </button>
      </div>
      <div class="clean">
        <span>Registro ricerche più vecchio di</span>
        <input v-model.number="keep.ricerche" type="number" min="0" max="3650" class="input num-in" aria-label="Giorni" />
        <span>giorni</span>
        <button type="button" class="btn btn-sm btn-danger" :disabled="!toDelete.ricerche || !!busy" @click="pulisci('ricerche')">
          {{ busy === 'ricerche' ? 'Elimino…' : `Elimina ${toDelete.ricerche ?? '…'}` }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.center { display: flex; justify-content: center; padding: 16px 0; }
.log { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.log li { padding: 8px 0; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 2px; }
.log li:last-child { border-bottom: 0; }
.note { white-space: pre-line; color: var(--text); }
.nums { font-variant-numeric: tabular-nums; }
.ok { color: var(--ok); font-weight: 600; }
.ko { color: var(--warn); font-weight: 600; }
.badge.warn { background: color-mix(in srgb, var(--warn) 16%, var(--surface)); color: var(--warn); }
.clean { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.clean > span:first-child { flex: 1 1 180px; }
@media (max-width: 560px) {
  .clean > span:first-child { flex-basis: 100%; }
  .clean .btn { margin-left: auto; }
}
.num-in { width: 76px; padding: 6px 8px; }
.clean .btn { min-width: 104px; justify-content: center; }
</style>
