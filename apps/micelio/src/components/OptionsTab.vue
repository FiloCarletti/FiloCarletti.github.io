<script setup>
import { computed, ref } from 'vue'
import { toast } from '@shared/toast.js'
import { ACHIEVEMENTS, RESEARCH } from '../game/data.js'
import {
  DEBUG, debugFill, debugSkip, debugSpore, exportSave, game, importSave, lastSaved, now, resetGame, save,
} from '../game/store.js'
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

const plain = computed(() => (DEBUG ? JSON.stringify(game.value, null, 2) : ''))
const showState = ref(false)
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
        <button class="btn btn-sm" @click="showState = !showState">{{ showState ? 'Nascondi' : 'Mostra' }} stato</button>
      </div>
      <pre v-if="showState" class="state">{{ plain }}</pre>
    </section>
  </div>
</template>

<style scoped>
.stats { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; margin: 0; }
.stats dd { margin: 0; font-variant-numeric: tabular-nums; }
.code { font-family: var(--mono); font-size: .78rem; min-height: 70px; word-break: break-all; }
.debug { border-color: var(--warn); }
.state { max-height: 320px; overflow: auto; font-size: .75rem; background: var(--surface-2); padding: 8px; border-radius: var(--radius); margin: 0; }
</style>
