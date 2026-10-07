<script setup>
// Siti su cui Claude può cercare: quelli supportati si attivano o disattivano per tutto lo spazio (ogni monitoraggio
// può poi sceglierne un sottoinsieme); gli altri sono elencati con il motivo per cui non si usano.
// Affidabilità misurata: esito delle ultime ricerche della routine (registro in voli_esecuzioni).
import { computed, onMounted, ref } from 'vue'
import { supabase, unwrap, toast, useSpace, fmtDateTime } from '@shared'
import { T } from '../db.js'
import { FONTI, fonteAttiva } from '../lib/fonti.js'
import { setFonte, useData } from '../store.js'

const { attive, load } = useData()
const { spaceId, canWrite } = useSpace()
const esecuzioni = ref([])
onMounted(async () => {
  await load()
  try {
    esecuzioni.value = unwrap(await supabase.from(T.esecuzioni).select('created_at, fonti')
      .eq('space_id', spaceId.value).order('created_at', { ascending: false }).limit(30))
  } catch (e) {
    toast.error(e)
  }
})

/** Per fonte: ricerche, riuscite (senza errori), voli medi, ultimo errore. */
const misure = computed(() => {
  const m = {}
  for (const e of esecuzioni.value) {
    for (const [codice, s] of Object.entries(e.fonti ?? {})) {
      const x = (m[codice] ??= { n: 0, ok: 0, voli: 0, errore: null, quando: null })
      x.n++
      if (s.ok) x.ok++
      x.voli += s.voli ?? 0
      if (!s.ok && !x.errore) { x.errore = s.errore; x.quando = e.created_at }
    }
  }
  return m
})
const salvando = ref('')
async function cambia(codice, v) {
  salvando.value = codice
  try {
    await setFonte(codice, v)
    toast.ok(v ? 'Fonte attivata' : 'Fonte disattivata: la routine non la userà')
  } catch (e) {
    toast.error(e)
  } finally {
    salvando.value = ''
  }
}
const AFF = { alta: 'ok', media: 'mid', bassa: 'low', bloccata: 'bad' }
</script>

<template>
  <div class="stack" style="gap: 14px">
    <div>
      <h2 style="margin: 0">Fonti</h2>
      <p class="muted small" style="margin: 2px 0 0">
        Siti provati il 7 ottobre 2026. Quelli supportati li legge la routine con gli script della repo; per ogni monitoraggio
        puoi scegliere su quali cercare.
      </p>
    </div>
    <article v-for="f in FONTI" :key="f.codice" class="card stack fonte" :class="{ off: !f.supportata }">
      <div class="row-between" style="align-items: flex-start">
        <div>
          <strong>{{ f.nome }}</strong> <span class="muted small">· {{ f.tipo }}</span>
          <div class="row" style="gap: 6px; margin-top: 4px">
            <span class="badge" :class="AFF[f.affidabilita]">affidabilità {{ f.affidabilita }}</span>
            <span v-if="!f.supportata" class="badge">non usata</span>
          </div>
        </div>
        <label v-if="f.supportata" class="switch">
          <input type="checkbox" :checked="fonteAttiva(f.codice, attive)" :disabled="!canWrite || salvando === f.codice" @change="cambia(f.codice, $event.target.checked)" />
          <span>{{ fonteAttiva(f.codice, attive) ? 'Attiva' : 'Spenta' }}</span>
        </label>
      </div>
      <p class="small" style="margin: 0">{{ f.note }}</p>
      <p class="muted small" style="margin: 0">
        <template v-if="f.metodo">{{ f.metodo }} · </template>{{ f.copre }}
      </p>
      <p v-if="misure[f.codice]" class="small" style="margin: 0">
        Ultime {{ misure[f.codice].n }} ricerche: <strong>{{ misure[f.codice].ok }}</strong> senza errori,
        in media {{ Math.round(misure[f.codice].voli / misure[f.codice].n) }} voli.
        <span v-if="misure[f.codice].errore" class="error-text">Ultimo errore ({{ fmtDateTime(misure[f.codice].quando) }}): {{ misure[f.codice].errore }}</span>
      </p>
    </article>
  </div>
</template>

<style scoped>
.fonte.off { opacity: .75; }
.switch { display: inline-flex; align-items: center; gap: 6px; font-size: .9rem; white-space: nowrap; }
.badge.ok { background: color-mix(in srgb, var(--ok) 18%, var(--surface)); color: var(--ok); }
.badge.mid { background: color-mix(in srgb, var(--warn) 16%, var(--surface)); color: var(--warn); }
.badge.low, .badge.bad { background: color-mix(in srgb, var(--danger) 14%, var(--surface)); color: var(--danger); }
.error-text { display: block; margin-top: 2px; font-size: .84rem; }
</style>
