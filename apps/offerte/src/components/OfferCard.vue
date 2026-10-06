<script setup>
// Una riga di offerta: prodotto, supermercato, validità, prezzo e sconto.
// Se l'offerta riconosce un prodotto seguito lo mostra (★), altrimenti permette di seguirlo.
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { fmtEuro, useSpace } from '@shared'
import { openOfferta, openProdotto, useData } from '../store.js'
import { validity } from '../lib/dates.js'
import { buonPrezzo } from '../lib/match.js'
import { fmtUnit, safeUrl } from '../lib/util.js'

const props = defineProps({
  offerta: { type: Object, required: true },
  showSupermercato: { type: Boolean, default: true },
})
const { canWrite } = useSpace()
const { smById, prodottiByOffer } = useData()

const o = computed(() => props.offerta)
const sm = computed(() => smById.value.get(o.value.supermercato_id))
const segue = computed(() => prodottiByOffer.value.get(o.value.id) ?? [])
const good = computed(() => segue.value.some((p) => buonPrezzo(o.value, p)))
const val = computed(() => validity(o.value))
const isNew = computed(() => Date.now() - new Date(o.value.created_at).getTime() < 36 * 3600e3)
const detail = computed(() => [o.value.marca, o.value.formato].filter(Boolean).join(' · '))
const url = computed(() => safeUrl(o.value.url))
</script>

<template>
  <article class="offer">
    <div class="info">
      <div class="name">
        <span class="nome">{{ o.nome }}</span>
        <span v-if="detail" class="muted small detail">{{ detail }}</span>
      </div>
      <div class="tags">
        <span v-if="showSupermercato" class="badge">{{ sm?.nome ?? '—' }}</span>
        <span class="badge" :class="val.tone && `v-${val.tone}`">{{ val.text }}</span>
        <span v-if="o.condizioni" class="badge">{{ o.condizioni }}</span>
        <span v-if="isNew" class="badge badge-primary">nuova</span>
      </div>
      <div class="actions small">
        <RouterLink v-for="p in segue" :key="p.id" :to="`/prodotti/${p.id}`" class="star">★ {{ p.nome }}</RouterLink>
        <span v-if="good" class="badge good">buon prezzo</span>
        <button v-if="!segue.length && canWrite" type="button" class="link" @click="openProdotto({ fromOffer: o })">☆ Segui</button>
        <a v-if="url" :href="url" target="_blank" rel="noopener noreferrer" class="link muted">volantino ↗</a>
        <button v-if="canWrite" type="button" class="link muted" @click="openOfferta({ offerta: o })">modifica</button>
      </div>
    </div>
    <div class="price">
      <span v-if="o.sconto_pct" class="disc">−{{ o.sconto_pct }}%</span>
      <strong class="now">{{ fmtEuro(o.prezzo) }}</strong>
      <s v-if="o.prezzo_pieno" class="muted small">{{ fmtEuro(o.prezzo_pieno) }}</s>
      <span v-if="o.prezzo_unitario && o.unita" class="muted small unit">{{ fmtUnit(o.prezzo_unitario, o.unita) }}</span>
    </div>
  </article>
</template>

<style scoped>
.offer { display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); }
.offer:last-child { border-bottom: 0; padding-bottom: 0; }
.info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.name { line-height: 1.3; overflow-wrap: anywhere; }
.nome { font-weight: 600; }
.detail { margin-left: 5px; }
.tags, .actions { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
.tags { gap: 4px; }
.price { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; min-width: 72px; text-align: right; font-variant-numeric: tabular-nums; }
.now { font-size: 1.15rem; }
.unit { white-space: nowrap; }
.disc { padding: 1px 7px; border-radius: 999px; background: var(--danger); color: var(--surface); font-size: .78rem; font-weight: 700; }
.v-last { background: color-mix(in srgb, var(--warn) 16%, var(--surface)); color: var(--warn); }
.v-soon { background: var(--primary-soft); color: var(--primary); }
.v-old { text-decoration: line-through; }
.good { background: color-mix(in srgb, var(--ok) 16%, var(--surface)); color: var(--ok); font-weight: 600; }
.star { color: #a86b00; font-weight: 600; text-decoration: none; }
@media (prefers-color-scheme: dark) { .star { color: #f0b429; } }
.link { padding: 0; border: 0; background: none; font: inherit; color: var(--primary); cursor: pointer; text-decoration: none; }
.link.muted { color: var(--muted); }
.link:hover { text-decoration: underline; }
</style>
