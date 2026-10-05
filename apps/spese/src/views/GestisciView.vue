<script setup>
// Categorie (enum espandibile: principali e secondarie), import/export CSV, spazi.
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { toast, useSpace, spaceUrl } from '@shared'
import {
  addCategoria, deleteCategoria, mergeCategoria, spaceIcon, spaceLabel, updateCategoria, useData,
} from '../store.js'
import { toCSV } from '../lib/csv.js'
import { PALETTE, catColor } from '../lib/theme.js'

const { spaceId, canWrite, canManage } = useSpace()
const { state, movimenti, principali, secondarie, usage, catById, currentSpace, writableSpaces, load } = useData()
onMounted(load)

const LEVELS = [
  { key: 'principale', title: 'Categorie principali', hint: 'Il "cosa": Spesa, Casa, Trasporti, Stipendio…' },
  { key: 'secondaria', title: 'Categorie secondarie', hint: 'Facoltative, trasversali: un viaggio, un progetto, "Regali", "Deducibile"…' },
]
const listOf = (l) => (l === 'principale' ? principali.value : secondarie.value)
const newName = ref({ principale: '', secondaria: '' })
const editing = ref(null) // id in modifica
const editName = ref('')
const palette = ref(null) // id con la palette aperta
const busy = ref(false)

async function guard(fn, ok) {
  busy.value = true
  try { await fn(); if (ok) toast.ok(ok) } catch (e) { toast.error(e) } finally { busy.value = false }
}
function add(livello) {
  const nome = newName.value[livello].trim()
  if (!nome) return
  if (listOf(livello).some((c) => c.nome.toLowerCase() === nome.toLowerCase())) return toast.info('Esiste già')
  guard(async () => { await addCategoria(nome, livello); newName.value[livello] = '' }, 'Categoria aggiunta')
}
function startEdit(c) { editing.value = c.id; editName.value = c.nome }
function saveEdit(c) {
  if (editing.value !== c.id) return // Invio e blur arrivano entrambi
  const nome = editName.value.trim()
  editing.value = null
  if (!nome || nome === c.nome) return
  const dup = listOf(c.livello).find((x) => x.id !== c.id && x.nome.toLowerCase() === nome.toLowerCase())
  if (dup) {
    if (confirm(`«${dup.nome}» esiste già. Unire «${c.nome}» in «${dup.nome}»?`)) guard(() => mergeCategoria(c.id, dup.id), 'Categorie unite')
    return
  }
  guard(() => updateCategoria(c.id, { nome }), 'Rinominata')
}
function setColor(c, colore) {
  palette.value = null
  guard(() => updateCategoria(c.id, { colore }))
}
function merge(c, toId) {
  const to = catById.value.get(toId)
  if (!to || !confirm(`Spostare i ${usage.value.get(c.id)?.n ?? 0} movimenti di «${c.nome}» in «${to.nome}» ed eliminare «${c.nome}»?`)) return
  guard(() => mergeCategoria(c.id, to.id), 'Categorie unite')
}
function remove(c) {
  const n = usage.value.get(c.id)?.n ?? 0
  if (!confirm(n ? `Eliminare «${c.nome}»? ${n} movimenti resteranno senza questa categoria.` : `Eliminare «${c.nome}»?`)) return
  guard(() => deleteCategoria(c.id), 'Eliminata')
}

function exportCsv() {
  const blob = new Blob(['﻿' + toCSV(movimenti.value, catById.value)], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `spese-${spaceLabel(currentSpace.value).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
const otherSpaces = computed(() => writableSpaces.value.filter((s) => s.id !== spaceId.value))
const open = (s) => { window.location.href = spaceUrl(__APP_SLUG__, s.id); window.location.reload() }
</script>

<template>
  <div class="stack" style="gap: 14px">
    <div v-if="state.loading && !state.loaded" class="card empty"><div class="spinner" style="margin: 0 auto" /></div>

    <template v-else>
      <section v-for="l in LEVELS" :key="l.key" class="card stack">
        <div>
          <h3 style="margin: 0">{{ l.title }}</h3>
          <p class="muted small" style="margin: 2px 0 0">{{ l.hint }}</p>
        </div>
        <p v-if="!listOf(l.key).length" class="muted small" style="margin: 0">Nessuna categoria. Si creano anche al volo durante l'inserimento o l'import.</p>
        <ul v-else class="cats">
          <li v-for="c in listOf(l.key)" :key="c.id">
            <div class="cat">
              <button class="swatch" :style="{ background: catColor(c) }" :disabled="!canWrite" :aria-label="`Colore di ${c.nome}`" @click="palette = palette === c.id ? null : c.id" />
              <input
                v-if="editing === c.id" v-model="editName" class="input name-input" maxlength="60" autofocus
                @keydown.enter="saveEdit(c)" @keydown.esc="editing = null" @blur="saveEdit(c)"
              />
              <button v-else class="name" :disabled="!canWrite" title="Rinomina" @click="startEdit(c)">{{ c.nome }}</button>
              <span class="muted small count">{{ usage.get(c.id)?.n ?? 0 }}</span>
              <template v-if="canWrite">
                <select class="select merge" :value="''" :aria-label="`Unisci ${c.nome} in…`" :disabled="busy" @change="merge(c, $event.target.value); $event.target.value = ''">
                  <option value="" disabled>Unisci in…</option>
                  <option v-for="o in listOf(l.key).filter((x) => x.id !== c.id)" :key="o.id" :value="o.id">{{ o.nome }}</option>
                </select>
                <button class="btn btn-ghost btn-icon btn-danger" :aria-label="`Elimina ${c.nome}`" :disabled="busy" @click="remove(c)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
                </button>
              </template>
            </div>
            <div v-if="palette === c.id" class="palette">
              <button v-for="[light] in PALETTE" :key="light" class="swatch" :class="{ on: c.colore === light }" :style="{ background: catColor({ colore: light }) }" :aria-label="light" @click="setColor(c, light)" />
            </div>
          </li>
        </ul>
        <form v-if="canWrite" class="row add" @submit.prevent="add(l.key)">
          <input v-model="newName[l.key]" class="input" maxlength="60" :placeholder="l.key === 'principale' ? 'Nuova categoria' : 'Nuova categoria secondaria'" />
          <button class="btn" :disabled="!newName[l.key].trim() || busy">Aggiungi</button>
        </form>
      </section>

      <section class="card stack">
        <h3 style="margin: 0">Import ed export</h3>
        <p class="muted small" style="margin: 0">
          CSV con colonne <code>date, account, category, amount, currency, description</code>: importo negativo = uscita, positivo = entrata.
        </p>
        <div class="row">
          <RouterLink v-if="canWrite || writableSpaces.length" to="/importa" class="btn btn-primary">Importa CSV</RouterLink>
          <button class="btn" :disabled="!movimenti.length" @click="exportCsv">Esporta CSV ({{ movimenti.length }})</button>
        </div>
      </section>

      <section class="card stack">
        <h3 style="margin: 0">Spazi</h3>
        <p class="muted small" style="margin: 0">
          Stai guardando <strong>{{ spaceIcon(currentSpace) }} {{ spaceLabel(currentSpace) }}</strong>.
          Ogni spazio ha movimenti e categorie propri: usa uno spazio condiviso per le spese comuni (casa, coppia, viaggi) e
          condividilo in lettura o modifica{{ canManage ? ' con il pulsante in alto a destra' : '' }}.
          Inserendo una spesa puoi sceglierne lo spazio; da <RouterLink to="/riclassifica">Riclassifica</RouterLink> puoi spostare o copiare movimenti tra spazi.
        </p>
        <ul v-if="otherSpaces.length" class="spaces">
          <li v-for="s in otherSpaces" :key="s.id">
            <button class="btn btn-sm" @click="open(s)">{{ spaceIcon(s) }} {{ spaceLabel(s) }}</button>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.cats { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.cat { display: flex; align-items: center; gap: 8px; min-height: 40px; }
.swatch { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--surface); box-shadow: 0 0 0 1px var(--border); cursor: pointer; flex-shrink: 0; padding: 0; }
.swatch:disabled { cursor: default; }
.swatch.on { box-shadow: 0 0 0 2px var(--text); }
.name { flex: 1; min-width: 0; text-align: left; border: 0; background: none; color: var(--text); font: inherit; font-weight: 500; padding: 6px 0; cursor: text; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.name:disabled { cursor: default; }
.name-input { flex: 1; padding: 5px 8px; }
.count { min-width: 28px; text-align: right; }
.merge { width: 110px; padding: 5px 6px; font-size: .84rem; }
.palette { display: flex; gap: 8px; flex-wrap: wrap; padding: 4px 0 8px 30px; }
.add { flex-wrap: nowrap; }
.spaces { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
@media (max-width: 420px) { .merge { width: 88px; } }
</style>
