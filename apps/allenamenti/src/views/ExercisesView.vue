<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useData } from '../store.js'
import CatDot from '../components/CatDot.vue'
import { sortCats } from '../lib/categories.js'
import { fmtNum, fmtShort, fmtVoce } from '../lib/metrics.js'

const { state, history, load, reload } = useData()
onMounted(load)
const q = ref('')

const groups = computed(() => {
  const s = q.value.trim().toLowerCase()
  const items = state.esercizi
    .filter((e) => !s || e.nome.toLowerCase().includes(s) || e.categoria.toLowerCase().includes(s))
    .map((e) => {
      const h = history.value.get(e.id) ?? []
      const maxPeso = Math.max(0, ...h.map((v) => Number(v.peso_kg ?? 0)))
      return { ...e, n: new Set(h.map((v) => v.sessione_id)).size, last: h.at(-1) ?? null, maxPeso, prs: h.filter((v) => v.isPR).length }
    })
  return sortCats([...new Set(items.map((e) => e.categoria))]).map((c) => ({
    cat: c,
    items: items.filter((e) => e.categoria === c).sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome, 'it')),
  }))
})
</script>

<template>
  <div class="stack" style="gap: 16px">
    <input v-model="q" class="input" type="search" placeholder="Cerca esercizio o categoria…" aria-label="Cerca esercizio" />

    <div v-if="state.loading && !state.loaded" class="card empty"><div class="spinner" style="margin: 0 auto" /></div>
    <div v-else-if="state.error && !state.loaded" class="card empty">
      <p class="error-text">{{ state.error }}</p>
      <button class="btn" style="margin-top: 12px" @click="reload">Riprova</button>
    </div>
    <div v-else-if="!state.esercizi.length" class="card empty">
      Nessun esercizio: si creano da soli quando registri o importi un allenamento.
    </div>
    <div v-else-if="!groups.length" class="card empty">Nessun esercizio corrisponde a “{{ q }}”.</div>

    <section v-for="g in groups" :key="g.cat" class="stack" style="gap: 8px">
      <h2 class="cat-title"><CatDot :cat="g.cat" /> <span class="muted small">{{ g.items.length }}</span></h2>
      <div class="list card">
        <RouterLink v-for="e in g.items" :key="e.id" :to="`/esercizi/${e.id}`" class="item">
          <div style="min-width: 0">
            <strong>{{ e.nome }}</strong>
            <div class="muted small">
              <template v-if="e.n">{{ e.n }} volt{{ e.n === 1 ? 'a' : 'e' }} · ultima {{ fmtShort(e.last.data) }} ({{ fmtVoce(e.last) }})</template>
              <template v-else>Mai fatto</template>
            </div>
          </div>
          <div class="right">
            <span v-if="e.maxPeso" class="badge">max {{ fmtNum(e.maxPeso) }} kg</span>
            <span v-if="e.prs" class="badge badge-primary">🏆 {{ e.prs }}</span>
          </div>
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.cat-title { font-size: 1rem; margin: 0; display: flex; align-items: center; gap: 6px; }
.cat-title :deep(.badge) { font-size: .9rem; color: var(--text); background: transparent; padding: 0; }
.list { padding: 0; overflow: hidden; }
.item { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 11px 14px; color: inherit; text-decoration: none; border-top: 1px solid var(--border); }
.item:first-child { border-top: 0; }
.item:hover { background: var(--surface-2); }
.right { display: flex; gap: 4px; flex-shrink: 0; }
</style>
