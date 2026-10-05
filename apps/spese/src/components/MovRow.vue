<script setup>
// Una riga di movimento: colore categoria, descrizione, categorie/conto/autore, importo.
import { computed } from 'vue'
import { Avatar } from '@shared'
import { useData } from '../store.js'
import { fmtMoney } from '../lib/money.js'
import { catColor } from '../lib/theme.js'

const props = defineProps({
  m: { type: Object, required: true },
  showDate: { type: String, default: '' },
  highlight: { type: String, default: '' },
})
const { catById, autoriById, showAutori } = useData()
const cat = computed(() => catById.value.get(props.m.categoria_id) ?? null)
const sub = computed(() => catById.value.get(props.m.sottocategoria_id) ?? null)
const autore = computed(() => (showAutori.value ? autoriById.value.get(props.m.owner_id) : null))
const title = computed(() => props.m.descrizione || cat.value?.nome || (props.m.importo < 0 ? 'Spesa' : 'Entrata'))

/** Spezza il titolo per evidenziare il testo cercato. */
const parts = computed(() => {
  const h = props.highlight.trim().toLowerCase()
  const t = title.value
  if (!h) return [{ t, hit: false }]
  const out = []
  let i = 0
  const low = t.toLowerCase()
  for (let j = low.indexOf(h); j > -1; j = low.indexOf(h, i)) {
    if (j > i) out.push({ t: t.slice(i, j), hit: false })
    out.push({ t: t.slice(j, j + h.length), hit: true })
    i = j + h.length
  }
  if (i < t.length) out.push({ t: t.slice(i), hit: false })
  return out
})
</script>

<template>
  <div class="mov">
    <span class="bar" :style="{ background: catColor(cat) }" aria-hidden="true" />
    <div class="main">
      <div class="title"><template v-for="(p, i) in parts" :key="i"><mark v-if="p.hit">{{ p.t }}</mark><template v-else>{{ p.t }}</template></template></div>
      <div class="meta">
        <span v-if="showDate">{{ showDate }}</span>
        <span :class="{ none: !cat }">{{ cat?.nome ?? 'Senza categoria' }}</span>
        <span v-if="sub" class="sub" :style="{ '--c': catColor(sub) }">{{ sub.nome }}</span>
        <span v-if="m.conto">{{ m.conto }}</span>
      </div>
    </div>
    <Avatar v-if="autore" :name="autore.name" :src="autore.avatar" :size="20" :title="`Inserito da ${autore.name}`" />
    <strong class="amt" :class="m.importo < 0 ? 'out' : 'in'">{{ fmtMoney(Number(m.importo), m.valuta, { sign: m.importo > 0 }) }}</strong>
  </div>
</template>

<style scoped>
.mov { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 9px 0; }
.bar { width: 4px; align-self: stretch; border-radius: 4px; flex-shrink: 0; }
.main { flex: 1; min-width: 0; }
.title { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta { display: flex; flex-wrap: wrap; gap: 0 8px; font-size: .8rem; color: var(--muted); }
.meta > * + *::before { content: '·'; margin-right: 8px; }
.meta .none { font-style: italic; }
.sub { color: var(--c); font-weight: 500; }
.amt { font-variant-numeric: tabular-nums; white-space: nowrap; }
.amt.out { color: var(--text); }
.amt.in { color: var(--ok); }
mark { background: color-mix(in srgb, var(--warn) 30%, transparent); color: inherit; border-radius: 3px; padding: 0 1px; }
</style>
