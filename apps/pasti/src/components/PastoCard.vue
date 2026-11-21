<script setup>
// Un pasto nel diario: riassunto sempre visibile, dettaglio (alimenti, gruppi, nutrienti, commento) apribile.
import { computed, ref } from 'vue'
import { GRUPPI, TIPO, fmt } from '../lib/analisi.js'

const props = defineProps({ p: { type: Object, required: true }, canWrite: Boolean })
defineEmits(['edit'])
const open = ref(false)

const tipo = computed(() => TIPO[props.p.tipo] ?? { icon: '🍴', label: props.p.tipo })
const gruppi = computed(() => Object.entries(props.p.gruppi ?? {})
  .filter(([, v]) => Number(v) > 0)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => ({ k, label: GRUPPI[k]?.label ?? k, v })))
const voto = computed(() => {
  const v = props.p.punteggio
  if (v == null) return null
  return { v, cls: v >= 7 ? 'good' : v >= 5 ? 'mid' : 'low' }
})
const FONTI = { foto: '📷 da foto', descrizione: '💬 da descrizione', manuale: '✍️ a mano' }
</script>

<template>
  <article class="pasto">
    <button type="button" class="head" :aria-expanded="open" @click="open = !open">
      <span class="ico" aria-hidden="true">{{ tipo.icon }}</span>
      <span class="main">
        <span class="row tit">
          <strong>{{ tipo.label }}</strong>
          <span v-if="p.luogo" class="muted small">· {{ p.luogo }}</span>
        </span>
        <span class="desc small">{{ p.descrizione || 'Nessuna descrizione' }}</span>
      </span>
      <span class="side">
        <span class="kcal">{{ fmt(p.kcal) }}<small> kcal</small></span>
        <span v-if="voto" class="voto" :class="voto.cls" :title="`Qualità ${voto.v}/10`">{{ voto.v }}/10</span>
      </span>
    </button>
    <div v-if="open" class="body stack">
      <div class="row badges">
        <span class="badge">{{ FONTI[p.fonte] ?? p.fonte }}</span>
        <span v-if="p.fritto" class="badge">🍟 fritto/impanato</span>
        <span v-if="p.data_stimata" class="badge">data stimata</span>
      </div>
      <p v-if="p.commento" class="commento">{{ p.commento }}</p>
      <div class="nut">
        <div><span class="muted small">Proteine</span><strong>{{ fmt(p.proteine_g) }} g</strong></div>
        <div><span class="muted small">Carboidrati</span><strong>{{ fmt(p.carboidrati_g) }} g</strong></div>
        <div><span class="muted small">zuccheri liberi</span><strong>{{ fmt(p.zuccheri_g) }} g</strong></div>
        <div><span class="muted small">Grassi</span><strong>{{ fmt(p.grassi_g) }} g</strong></div>
        <div><span class="muted small">di cui saturi</span><strong>{{ fmt(p.grassi_saturi_g) }} g</strong></div>
        <div><span class="muted small">Fibre</span><strong>{{ fmt(p.fibre_g) }} g</strong></div>
        <div><span class="muted small">Sodio</span><strong>{{ fmt(p.sodio_mg) }} mg</strong></div>
      </div>
      <div v-if="p.alimenti?.length">
        <span class="label">Alimenti (stima)</span>
        <ul class="alimenti small">
          <li v-for="(a, i) in p.alimenti" :key="i"><span>{{ a.nome }}</span><span class="muted">{{ a.grammi ? `${fmt(a.grammi)} g` : '' }}</span></li>
        </ul>
      </div>
      <div v-if="gruppi.length" class="row">
        <span v-for="x in gruppi" :key="x.k" class="badge">{{ x.label }} {{ fmt(x.v) }} g</span>
      </div>
      <div v-if="canWrite" class="row">
        <button type="button" class="btn btn-sm" @click="$emit('edit', p)">Modifica</button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.pasto { border-top: 1px solid var(--border); }
.pasto:first-child { border-top: 0; }
.head { all: unset; box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 0; cursor: pointer; }
.head:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; border-radius: 6px; }
.ico { font-size: 1.4rem; width: 32px; text-align: center; flex: none; }
.main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.tit { gap: 4px; }
.desc { color: var(--muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.side { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex: none; }
.kcal { font-weight: 700; font-variant-numeric: tabular-nums; }
.kcal small { font-weight: 500; color: var(--muted); }
.voto { font-size: .75rem; font-weight: 700; padding: 1px 7px; border-radius: 999px; background: var(--surface-2); }
.voto.good { color: var(--ok); }
.voto.mid { color: var(--warn); }
.voto.low { color: var(--danger); }
.body { padding: 0 0 14px 42px; gap: 10px; }
.commento { margin: 0; white-space: pre-line; }
.nut { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
.nut div { display: flex; flex-direction: column; }
.alimenti { list-style: none; margin: 4px 0 0; padding: 0; }
.alimenti li { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; }
@media (max-width: 420px) { .body { padding-left: 0; } }
</style>
