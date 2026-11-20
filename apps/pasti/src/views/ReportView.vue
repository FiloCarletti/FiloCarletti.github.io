<script setup>
// Report periodici scritti da Claude: sintesi, carenze, eccessi e consigli.
import { onMounted } from 'vue'
import { toast, useSpace } from '@shared'
import { eliminaReport, load, state } from '../store.js'
import { fmtShort } from '../lib/dates.js'

const { canWrite } = useSpace()
onMounted(() => load())

async function remove(r) {
  if (!confirm('Eliminare questo report?')) return
  try { await eliminaReport(r.id); toast.ok('Eliminato') } catch (e) { toast.error(e) }
}
</script>

<template>
  <div class="stack">
    <div v-if="state.loading && !state.loaded" class="card empty"><div class="spinner" style="margin: 0 auto" /></div>
    <div v-else-if="!state.report.length" class="card empty">
      Nessun report. Chiedi a Claude "fammi il punto sui pasti della settimana": l'analisi finisce qui.
    </div>
    <article v-for="r in state.report" :key="r.id" class="card stack">
      <div class="row-between">
        <h2 style="margin: 0">{{ r.titolo || 'Report' }}</h2>
        <span class="row">
          <span v-if="r.punteggio" class="badge badge-primary">{{ r.punteggio }}/10</span>
          <span class="muted small">{{ fmtShort(r.dal) }} – {{ fmtShort(r.al) }}</span>
        </span>
      </div>
      <p v-if="r.sintesi" class="pre">{{ r.sintesi }}</p>
      <div v-if="r.carenze?.length"><span class="label">⬇️ Poco</span><ul><li v-for="(x, i) in r.carenze" :key="i">{{ x }}</li></ul></div>
      <div v-if="r.eccessi?.length"><span class="label">⬆️ Troppo</span><ul><li v-for="(x, i) in r.eccessi" :key="i">{{ x }}</li></ul></div>
      <div v-if="r.consigli?.length"><span class="label">✅ Cosa cambiare</span><ol><li v-for="(x, i) in r.consigli" :key="i">{{ x }}</li></ol></div>
      <div v-if="canWrite" class="row"><button type="button" class="btn btn-sm btn-ghost btn-danger" @click="remove(r)">Elimina</button></div>
    </article>
  </div>
</template>

<style scoped>
.pre { margin: 0; white-space: pre-line; }
ul, ol { margin: 4px 0 0; padding-left: 20px; display: flex; flex-direction: column; gap: 3px; }
</style>
