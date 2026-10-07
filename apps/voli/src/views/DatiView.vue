<script setup>
// Registro delle ricerche (per controllare la routine), spazio occupato, pulizia e impostazioni della routine
// (prompt da usare e link per avviarla da "Cerca ora").
import { computed, onMounted, ref } from 'vue'
import { supabase, unwrap, toast, useSpace, fmtDateTime } from '@shared'
import { T } from '../db.js'
import { fonteNome } from '../lib/fonti.js'
import { promptRoutine, SKILL } from '../lib/claude.js'
import { pref, reload, savePref } from '../store.js'

const { spaceId, canWrite } = useSpace()
const esecuzioni = ref([])
const conteggi = ref({})
const loading = ref(true)

async function carica() {
  loading.value = true
  try {
    const sid = spaceId.value
    const [e, ...counts] = await Promise.all([
      supabase.from(T.esecuzioni).select('*').eq('space_id', sid).order('created_at', { ascending: false }).limit(30),
      ...['ricerche', 'voli', 'prezzi', 'andamento', 'avvisi', 'esecuzioni'].map((k) =>
        supabase.from(T[k]).select('id', { count: 'exact', head: true }).eq('space_id', sid)),
    ])
    esecuzioni.value = unwrap(e)
    conteggi.value = Object.fromEntries(['ricerche', 'voli', 'prezzi', 'andamento', 'avvisi', 'esecuzioni'].map((k, i) => [k, counts[i].count ?? 0]))
  } catch (err) {
    toast.error(err)
  } finally {
    loading.value = false
  }
}
onMounted(carica)

const NOMI = { ricerche: 'Monitoraggi', voli: 'Voli (prezzi attuali)', prezzi: 'Storico prezzi', andamento: 'Andamento', avvisi: 'Avvisi', esecuzioni: 'Registro ricerche' }
const totale = computed(() => Object.values(conteggi.value).reduce((a, b) => a + b, 0))

const pulizia = ref({ voli: 30, registro: 90, andamento: 12 })
const pulendo = ref(false)
async function pulisci() {
  if (!confirm('Cancello i voli già passati (con il loro storico), il registro e gli avvisi letti più vecchi, e l’andamento oltre il limite. Continuo?')) return
  pulendo.value = true
  try {
    const r = unwrap(await supabase.rpc('voli_pulisci', {
      p_space_id: spaceId.value, p_giorni_voli: pulizia.value.voli, p_giorni_registro: pulizia.value.registro, p_mesi_andamento: pulizia.value.andamento,
    }))
    toast.ok(`Eliminati: ${r.voli} voli, ${r.registro} ricerche del registro, ${r.avvisi} avvisi, ${r.andamento} punti di andamento`)
    await Promise.all([carica(), reload()])
  } catch (e) {
    toast.error(e)
  } finally {
    pulendo.value = false
  }
}

const routineUrl = ref(pref('routineUrl', ''))
function salvaRoutine() {
  const v = routineUrl.value.trim()
  if (v && !/^https:\/\/claude\.ai\//.test(v)) { toast.error('Incolla il link della routine (inizia con https://claude.ai/)'); return }
  savePref('routineUrl', v)
  toast.ok(v ? 'Link salvato su questo dispositivo' : 'Link rimosso')
}
const prompt = promptRoutine()
async function copia() {
  try { await navigator.clipboard.writeText(prompt); toast.ok('Prompt copiato') } catch { toast.error('Copia non riuscita') }
}
const esito = (s) => (s.ok ? 'ok' : 'err')
</script>

<template>
  <div class="stack" style="gap: 16px">
    <section class="card stack">
      <h3 style="margin: 0">Ricerche</h3>
      <div v-if="loading" class="empty"><div class="spinner" style="margin: 0 auto" /></div>
      <p v-else-if="!esecuzioni.length" class="muted small" style="margin: 0">
        Nessuna ricerca ancora. Con la routine pianificata qui vedi ogni volta cosa ha trovato e se qualche sito ha dato problemi.
      </p>
      <div v-else class="table-wrap">
        <table class="table small">
          <thead><tr><th>Quando</th><th>Fonti</th><th class="num">Nuovi</th><th class="num">Agg.</th><th class="num">Avvisi</th></tr></thead>
          <tbody>
            <template v-for="e in esecuzioni" :key="e.id">
              <tr>
                <td style="white-space: nowrap">{{ fmtDateTime(e.created_at) }}<div class="muted">{{ e.fonte === 'claude' ? 'Claude' : e.fonte }}</div></td>
                <td>
                  <span v-for="(s, f) in e.fonti" :key="f" class="badge" :class="esito(s)" :title="s.errore || ''">{{ fonteNome(f) }} {{ s.voli ?? 0 }}</span>
                </td>
                <td class="num">{{ e.nuovi }}</td>
                <td class="num">{{ e.aggiornati }}</td>
                <td class="num">{{ e.avvisi }}</td>
              </tr>
              <tr v-if="e.note || e.scartati"><td colspan="5" class="muted note">{{ e.scartati ? `${e.scartati} scartati. ` : '' }}{{ e.note }}</td></tr>
            </template>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card stack">
      <h3 style="margin: 0">Routine di Claude</h3>
      <p class="small" style="margin: 0">
        Crea una routine pianificata in Claude Code (sulla repo dell'app, con il connettore Supabase) con questo prompt.
        La skill <strong>{{ SKILL }}</strong> cerca i voli di tutti i tuoi monitoraggi e di quelli condivisi con te, registra i
        prezzi e genera gli avvisi. Per scegliere gli orari, guarda “Quando cercare” nell'andamento di un monitoraggio.
      </p>
      <textarea class="textarea small mono" readonly rows="4" :value="prompt" aria-label="Prompt della routine" @focus="$event.target.select()" />
      <div class="row"><button type="button" class="btn btn-sm" @click="copia">Copia prompt</button></div>
      <label class="field">
        <span>Link della routine (per avviarla da “Cerca ora”, salvato solo su questo dispositivo)</span>
        <div class="row" style="flex-wrap: nowrap">
          <input v-model="routineUrl" type="url" class="input" placeholder="https://claude.ai/…" />
          <button type="button" class="btn" @click="salvaRoutine">Salva</button>
        </div>
      </label>
    </section>

    <section class="card stack">
      <h3 style="margin: 0">Spazio occupato</h3>
      <table class="table small">
        <tbody>
          <tr v-for="(n, k) in conteggi" :key="k"><td>{{ NOMI[k] }}</td><td class="num">{{ n.toLocaleString('it-IT') }}</td></tr>
          <tr><td><strong>Totale righe</strong></td><td class="num"><strong>{{ totale.toLocaleString('it-IT') }}</strong></td></tr>
        </tbody>
      </table>
      <p class="muted small" style="margin: 0">La routine pulisce da sola a ogni ricerca i voli già passati da più di 30 giorni e il registro più vecchio di 90 giorni.</p>
      <template v-if="canWrite">
        <div class="pgrid">
          <label class="field"><span>Voli passati da più di (giorni)</span><input v-model.number="pulizia.voli" type="number" min="0" class="input" /></label>
          <label class="field"><span>Registro e avvisi letti oltre (giorni)</span><input v-model.number="pulizia.registro" type="number" min="0" class="input" /></label>
          <label class="field"><span>Andamento oltre (mesi)</span><input v-model.number="pulizia.andamento" type="number" min="1" class="input" /></label>
        </div>
        <div class="row"><button type="button" class="btn btn-danger" :disabled="pulendo" @click="pulisci">{{ pulendo ? 'Pulisco…' : 'Pulisci ora' }}</button></div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.mono { font-family: var(--mono); }
.badge { margin: 0 4px 4px 0; }
.badge.ok { background: color-mix(in srgb, var(--ok) 18%, var(--surface)); color: var(--ok); }
.badge.err { background: color-mix(in srgb, var(--danger) 14%, var(--surface)); color: var(--danger); }
.note { font-size: .82rem; border-bottom: 1px solid var(--border); padding-top: 0; }
.pgrid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
</style>
