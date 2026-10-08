<script setup>
import { computed, ref } from 'vue'
import { toast } from '@shared/toast.js'
import { ACHIEVEMENTS, RELICS, RESEARCH } from '../game/data.js'
import {
  DEBUG, debugFill, debugRelics, debugSkip, debugSpore, exportSave, game, importSave, lastSaved, now, resetGame, save,
} from '../game/store.js'
import * as E from '../game/engine.js'
import { fmt, fmtDuration } from '../game/format.js'

const dateTime = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const stats = computed(() => {
  const s = game.value
  return [
    ['Inizio del gioco', dateTime.format(new Date(s.created))],
    ['Giorni nel bosco', fmt((now.value - s.created) / 86400e3)],
    ['Partita in corso da', fmtDuration(now.value - s.run.start)],
    ['Sporulazioni', fmt(s.life.spor)],
    ['Partita più breve', s.life.bestRun ? fmtDuration(s.life.bestRun) : '—'],
    ['Spore raccolte in totale', fmt(s.life.sporeTot)],
    ['Nutrienti prodotti in totale', fmt(s.life.earned.nutrienti)],
    ['Luce prodotta in totale', fmt(s.life.earned.luce)],
    ['Tocchi', fmt(s.life.clicks)],
    ['Ricerche (partita)', `${Object.keys(s.rs).length} / ${RESEARCH.length}`],
    ['Traguardi', `${Object.keys(s.ach).length} / ${ACHIEVEMENTS.length}`],
    ['Anelli dell’Albero Madre', fmt(s.rings)],
    ['Spedizioni tornate', fmt(s.life.exp)],
    ['Reperti trovati', `${Object.keys(s.relics).length} / ${RELICS.length}`],
  ]
})

const exported = ref('')
async function doExport() {
  exported.value = await exportSave()
  try {
    await navigator.clipboard.writeText(exported.value)
    toast.ok('Salvataggio copiato negli appunti')
  } catch {
    toast.info('Copia il testo qui sotto')
  }
}

const importText = ref('')
async function doImport() {
  if (!confirm('Il gioco attuale verrà sostituito dal salvataggio importato (una copia resta come backup). Continuare?')) return
  try {
    await importSave(importText.value)
    importText.value = ''
    toast.ok('Salvataggio importato')
  } catch (e) {
    toast.error(e)
  }
}

async function doReset() {
  if (!confirm('Ricominciare da capo? Perderai tutto: spore, genoma, Albero Madre e traguardi.')) return
  if (!confirm('Davvero? Non si torna indietro.')) return
  await resetGame()
  toast.ok('Nuovo inizio nel sottobosco 🌱')
}

async function saveNow() {
  await save()
  toast.ok('Salvato')
}

const plain = computed(() => (DEBUG && showState.value ? JSON.stringify(game.value, null, 2) : ''))
const showState = ref(false)

// ---- diario (solo debug)
const short = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
function describe([, type, x]) {
  switch (type) {
    case 'terr': return `🗺️ Territorio ${x}: ${E.territoryAt(x).name}`
    case 'spor': return `🌬️ Sporulazione: +${fmt(x[0])} spore (partita di ${fmtDuration(x[1] * 60e3)}, territorio ${x[2]})`
    case 'albero': return `🌳 Albero Madre stadio ${x}`
    case 'anello_maturo': return `🪵 Maturo l'anello ${x}`
    case 'anello': return `🪵 Anello ${x[0]} formato: ${E.TRAIT[x[1]]?.name ?? x[1]}`
    case 'exp': return `🎒 Spedizione: ${E.BIOME[x]?.name ?? x}`
    case 'reperto': return `🏺 ${E.RELIC[x[0]]?.name ?? x[0]} liv. ${x[1]}${x[2] ? ` (+${x[2]} spore)` : ''}`
    case 'apertura': return `📂 Riaperto dopo ${fmtDuration(x * 60e3)}`
    case 'migr': return `💾 Salvataggio aggiornato da v${x[0]} a v${x[1]}`
    default: return `${type} ${JSON.stringify(x ?? '')}`
  }
}
const showLog = ref(false)
const events = computed(() => (showLog.value ? [...game.value.log.ev].reverse().map((e) => ({ t: e[0], text: describe(e) })) : []))
const snaps = computed(() => (showLog.value ? [...game.value.log.snap].reverse().slice(0, 48) : []))
const logSize = computed(() => (DEBUG ? JSON.stringify(game.value.log).length : 0))
async function copyLog() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(game.value.log))
    toast.ok('Diario copiato negli appunti')
  } catch (e) {
    toast.error(e)
  }
}
</script>

<template>
  <div class="stack">
    <section class="card">
      <h3>📊 Statistiche</h3>
      <dl class="stats">
        <template v-for="[k, v] in stats" :key="k">
          <dt class="muted small">{{ k }}</dt>
          <dd>{{ v }}</dd>
        </template>
      </dl>
    </section>

    <section class="card stack">
      <h3 style="margin: 0">💾 Salvataggio</h3>
      <p class="muted small" style="margin: 0">
        Il gioco si salva da solo ogni 10 secondi e quando chiudi la pagina, solo in questo browser
        ({{ DEBUG ? 'in chiaro: modalità debug' : 'cifrato' }}). Ultimo salvataggio: {{ lastSaved ? dateTime.format(new Date(lastSaved)) : '—' }}.
        Alla riapertura viene calcolato quello che è cresciuto nel frattempo. Per passare a un altro dispositivo esporta e importa.
      </p>
      <div class="row">
        <button class="btn btn-sm" @click="saveNow">Salva ora</button>
        <button class="btn btn-sm" @click="doExport">Esporta</button>
      </div>
      <textarea v-if="exported" class="textarea code" readonly :value="exported" @focus="$event.target.select()" />
      <label class="field">
        <span>Importa un salvataggio</span>
        <textarea v-model="importText" class="textarea code" spellcheck="false" placeholder="MIC1.…" />
      </label>
      <div class="row">
        <button class="btn btn-sm" :disabled="!importText.trim()" @click="doImport">Importa</button>
        <span class="spacer" />
        <button class="btn btn-sm btn-danger" @click="doReset">Ricomincia da capo</button>
      </div>
    </section>

    <section v-if="DEBUG" class="card stack debug">
      <h3 style="margin: 0">🛠️ Debug</h3>
      <p class="muted small" style="margin: 0">Attivo con <code>npm run dev</code> o <code>?debug</code> nell'URL: salvataggi in chiaro in localStorage (<code>micelio-save</code>).</p>
      <div class="row">
        <span class="small muted">Simula assenza:</span>
        <button class="btn btn-sm" @click="debugSkip(3600e3)">1 h</button>
        <button class="btn btn-sm" @click="debugSkip(8 * 3600e3)">8 h</button>
        <button class="btn btn-sm" @click="debugSkip(86400e3)">1 giorno</button>
        <button class="btn btn-sm" @click="debugSkip(7 * 86400e3)">7 giorni</button>
      </div>
      <div class="row">
        <button class="btn btn-sm" @click="debugFill">Riempi i depositi</button>
        <button class="btn btn-sm" @click="debugSpore(100)">+100 spore</button>
        <button class="btn btn-sm" @click="debugRelics">+1 livello a ogni reperto</button>
        <button class="btn btn-sm" @click="showState = !showState">{{ showState ? 'Nascondi' : 'Mostra' }} stato</button>
      </div>
      <pre v-if="showState" class="state">{{ plain }}</pre>

      <h4 style="margin: 8px 0 0">📓 Diario</h4>
      <p class="muted small" style="margin: 0">
        {{ game.log.ev.length }} eventi, {{ game.log.snap.length }} istantanee orarie ({{ fmt(logSize / 1024) }} KB nel salvataggio).
        Le voci più vecchie si scartano o si diradano da sole.
      </p>
      <div class="row">
        <button class="btn btn-sm" @click="showLog = !showLog">{{ showLog ? 'Nascondi' : 'Mostra' }} diario</button>
        <button class="btn btn-sm" @click="copyLog">Copia diario (JSON)</button>
      </div>
      <template v-if="showLog">
        <ul class="log">
          <li v-for="(e, i) in events" :key="i"><span class="muted">{{ short.format(new Date(e.t)) }}</span> {{ e.text }}</li>
        </ul>
        <div class="table-wrap">
          <table class="table small">
            <thead>
              <tr><th>Ora</th><th class="num">Albero</th><th class="num">Terr.</th><th class="num">Spor.</th><th class="num">Anelli</th><th class="num">log nutr.</th><th class="num">log luce</th><th class="num">log molt.</th><th class="num">Spore tot.</th><th class="num">Sped.</th></tr>
            </thead>
            <tbody>
              <tr v-for="r in snaps" :key="r[0]">
                <td>{{ short.format(new Date(r[0])) }}</td>
                <td class="num">{{ r[1] }}</td><td class="num">{{ r[2] }}</td><td class="num">{{ r[3] }}</td><td class="num">{{ r[4] }}</td>
                <td class="num">{{ r[5] }}</td><td class="num">{{ r[6] }}</td><td class="num">{{ r[7] }}</td><td class="num">{{ fmt(r[8]) }}</td><td class="num">{{ r[10] }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.stats { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; margin: 0; }
.stats dd { margin: 0; font-variant-numeric: tabular-nums; }
.code { font-family: var(--mono); font-size: .78rem; min-height: 70px; word-break: break-all; }
.debug { border-color: var(--warn); }
.log { margin: 0; padding: 0 0 0 4px; list-style: none; max-height: 320px; overflow: auto; font-size: .82rem; display: grid; gap: 2px; }
.state { max-height: 320px; overflow: auto; font-size: .75rem; background: var(--surface-2); padding: 8px; border-radius: var(--radius); margin: 0; }
</style>
