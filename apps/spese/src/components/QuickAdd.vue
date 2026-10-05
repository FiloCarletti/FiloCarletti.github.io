<script setup>
// Inserimento/modifica rapida di un movimento: importo → categoria → Invio.
// Le categorie si scelgono per nome e si risolvono nello spazio di destinazione al salvataggio:
// così si può inserire (o spostare) un movimento in uno spazio diverso da quello aperto.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { toast, useSpace } from '@shared'
import {
  categorieOf, closeEditor, deleteMany, ensureCategorie, groupOf, insertMovimenti, lookupCat, pref, savePref,
  spaceIcon, spaceLabel, updateMovimento, useData,
} from '../store.js'
import { addDays, today } from '../lib/period.js'
import { fmtMoney, parseAmount } from '../lib/money.js'
import { catColor } from '../lib/theme.js'

const { spaceId } = useSpace()
const { editor, movimenti, catById, usage, conti, writableSpaces, defaultTarget, spaceById } = useData()

const m = editor.movimento
const isEdit = !!m
const segno = ref(editor.segno || -1)
const importo = ref(m ? String(Math.abs(m.importo)).replace('.', ',') : '')
const descrizione = ref(m?.descrizione ?? '')
const data = ref(m?.data ?? today())
const conto = ref(m?.conto ?? pref('conto', ''))
const valuta = ref(m?.valuta ?? 'EUR')
const catNome = ref(m ? catById.value.get(m.categoria_id)?.nome ?? '' : '')
const subNome = ref(m ? catById.value.get(m.sottocategoria_id)?.nome ?? '' : '')
const target = ref(m?.space_id ?? defaultTarget.value)
const details = ref(isEdit && (!!subNome.value || valuta.value !== 'EUR'))
const showAllCats = ref(false)
const newCat = ref(null) // null | 'principale' | 'secondaria'
const newCatName = ref('')
const busy = ref(false)
const amountEl = ref(null)

/* ---------- categorie dello spazio di destinazione ---------- */

const targetCats = ref([])
const loadingCats = ref(false)
watch(target, async (sid) => {
  loadingCats.value = true
  try { targetCats.value = await categorieOf(sid) } catch (e) { toast.error(e) } finally { loadingCats.value = false }
}, { immediate: true })

const sameSpace = computed(() => target.value === spaceId.value)
const tipo = computed(() => (segno.value < 0 ? 'uscita' : 'entrata'))
function sorted(gruppo) {
  const list = targetCats.value.filter((c) => groupOf(c) === gruppo)
  const key = segno.value < 0 ? 'neg' : 'pos'
  const score = (c) => (sameSpace.value ? usage.value.get(c.id)?.[key] ?? 0 : 0)
  return [...list].sort((a, b) => score(b) - score(a) || a.nome.localeCompare(b.nome, 'it'))
}
// Solo le categorie del tipo giusto: di uscita per le spese, di entrata per le entrate.
const principali = computed(() => sorted(tipo.value))
const secondarie = computed(() => sorted('secondaria'))
const VISIBLE = 8
const shownCats = computed(() => {
  const all = principali.value
  if (showAllCats.value || all.length <= VISIBLE + 1) return all
  const top = all.slice(0, VISIBLE)
  // la categoria scelta resta visibile anche se è tra le "altre"
  const sel = all.find((c) => c.nome === catNome.value)
  return sel && !top.includes(sel) ? [...top, sel] : top
})
// Categoria scelta ma assente nello spazio di destinazione: verrà creata lì.
const willCreate = computed(() => [
  catNome.value && !principali.value.some((c) => c.nome.toLowerCase() === catNome.value.toLowerCase()) && catNome.value,
  subNome.value && !secondarie.value.some((c) => c.nome.toLowerCase() === subNome.value.toLowerCase()) && subNome.value,
].filter(Boolean))
const colorOf = (c) => catColor(c)
// Cambiando uscita/entrata la categoria resta solo se esiste anche nell'altro tipo.
watch(segno, () => {
  if (catNome.value && !principali.value.some((c) => c.nome.toLowerCase() === catNome.value.toLowerCase())) catNome.value = ''
})

function pickCat(nome) { catNome.value = catNome.value === nome ? '' : nome }
function pickSub(nome) { subNome.value = subNome.value === nome ? '' : nome }
function confirmNewCat() {
  const nome = newCatName.value.trim()
  if (nome) {
    if (newCat.value === 'principale') catNome.value = nome
    else subNome.value = nome
  }
  newCat.value = null
  newCatName.value = ''
}

/* ---------- suggerimenti dalla storia ---------- */

const descrizioni = computed(() => {
  const seen = new Set()
  const out = []
  for (const x of movimenti.value) {
    if (Math.sign(x.importo) !== segno.value || !x.descrizione) continue
    const k = x.descrizione.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(x.descrizione)
    if (out.length >= 150) break
  }
  return out
})
/** Descrizione già usata: propone categoria (e conto) dell'ultima volta. */
function onDescrizione() {
  const d = descrizione.value.trim().toLowerCase()
  if (!d || catNome.value) return
  const prev = movimenti.value.find((x) => x.descrizione?.toLowerCase() === d && Math.sign(x.importo) === segno.value)
  if (!prev) return
  catNome.value = catById.value.get(prev.categoria_id)?.nome ?? ''
  if (!subNome.value) subNome.value = catById.value.get(prev.sottocategoria_id)?.nome ?? ''
  if (!conto.value && prev.conto) conto.value = prev.conto
}

/* ---------- spazi ---------- */

// Spazi tra cui scegliere: quelli scrivibili (più quello del movimento, se lo si sta modificando).
const spaces = computed(() => writableSpaces.value.length ? writableSpaces.value : [spaceById(target.value)].filter(Boolean))
const targetSpace = computed(() => spaceById(target.value))
const elsewhere = computed(() => (isEdit ? target.value !== m.space_id : !sameSpace.value))

/* ---------- salvataggio ---------- */

const amountValue = computed(() => parseAmount(importo.value))
const valid = computed(() => amountValue.value != null && amountValue.value !== 0 && /^\d{4}-\d{2}-\d{2}$/.test(data.value) && !!target.value)

async function save(again = false) {
  if (!valid.value || busy.value) {
    if (!amountValue.value) amountEl.value?.focus()
    return
  }
  busy.value = true
  try {
    const map = await ensureCategorie(target.value, [
      { gruppo: tipo.value, nome: catNome.value },
      { gruppo: 'secondaria', nome: subNome.value },
    ])
    const payload = {
      data: data.value,
      conto: conto.value.trim(),
      valuta: (valuta.value || 'EUR').toUpperCase(),
      descrizione: descrizione.value.trim(),
      importo: segno.value * Math.abs(amountValue.value),
      categoria_id: lookupCat(map, tipo.value, catNome.value),
      sottocategoria_id: lookupCat(map, 'secondaria', subNome.value),
    }
    if (payload.conto) savePref('conto', payload.conto)
    const where = spaceLabel(targetSpace.value)
    if (isEdit) {
      await updateMovimento(m.id, elsewhere.value ? { ...payload, space_id: target.value } : payload)
      toast.ok(elsewhere.value ? `Spostato in «${where}»` : 'Salvato')
    } else {
      await insertMovimenti(target.value, [payload])
      toast.ok(`${segno.value < 0 ? 'Spesa' : 'Entrata'} di ${fmtMoney(Math.abs(payload.importo), payload.valuta)} salvata${elsewhere.value ? ` in «${where}»` : ''}`)
    }
    if (again && !isEdit) {
      importo.value = ''
      descrizione.value = ''
      catNome.value = ''
      subNome.value = ''
      await nextTick()
      amountEl.value?.focus()
    } else {
      closeEditor()
    }
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}

async function remove() {
  if (!confirm('Eliminare questo movimento?')) return
  busy.value = true
  try {
    await deleteMany([m.id])
    toast.ok('Eliminato')
    closeEditor()
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}

function onKey(e) {
  if (e.key === 'Escape') closeEditor()
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  document.body.style.overflow = 'hidden'
  if (!isEdit) amountEl.value?.focus()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})
</script>

<template>
  <div class="backdrop" @click.self="closeEditor">
    <form class="sheet" role="dialog" aria-modal="true" :aria-label="isEdit ? 'Modifica movimento' : 'Nuovo movimento'" @submit.prevent="save(false)">
      <header class="head">
        <div class="seg" role="radiogroup" aria-label="Tipo">
          <button type="button" role="radio" :aria-checked="segno < 0" class="seg-btn" :class="{ on: segno < 0, out: segno < 0 }" @click="segno = -1">Uscita</button>
          <button type="button" role="radio" :aria-checked="segno > 0" class="seg-btn" :class="{ on: segno > 0, in: segno > 0 }" @click="segno = 1">Entrata</button>
        </div>
        <button type="button" class="btn btn-ghost btn-icon" aria-label="Chiudi" @click="closeEditor">✕</button>
      </header>

      <div class="body">
        <label class="amount" :class="segno < 0 ? 'out' : 'in'">
          <span class="sign" aria-hidden="true">{{ segno < 0 ? '−' : '+' }}</span>
          <input
            ref="amountEl" v-model="importo" class="amount-input" inputmode="decimal" autocomplete="off" placeholder="0,00"
            aria-label="Importo" enterkeyhint="done"
          />
          <span class="cur">{{ valuta === 'EUR' ? '€' : valuta }}</span>
        </label>

        <!-- Spazio di destinazione: visibile quando c'è una scelta, evidenziato se diverso da quello aperto -->
        <div v-if="spaces.length > 1" class="block">
          <span class="label">Spazio</span>
          <div class="chips">
            <button
              v-for="s in spaces" :key="s.id" type="button" class="chip" :class="{ on: target === s.id }"
              :aria-pressed="target === s.id" @click="target = s.id"
            >{{ spaceIcon(s) }} {{ spaceLabel(s) }}</button>
          </div>
          <p v-if="elsewhere" class="notice small">
            {{ isEdit ? 'Il movimento verrà spostato' : 'Verrà salvato' }} in <strong>«{{ spaceLabel(targetSpace) }}»</strong>,
            non nello spazio che stai guardando.
          </p>
        </div>

        <div class="block">
          <span class="label">Categoria</span>
          <div v-if="loadingCats" class="muted small">Caricamento…</div>
          <div v-else class="chips">
            <button
              v-for="c in shownCats" :key="c.id" type="button" class="chip" :class="{ on: catNome === c.nome }"
              :style="{ '--c': colorOf(c) }" :aria-pressed="catNome === c.nome" @click="pickCat(c.nome)"
            ><span class="dot" />{{ c.nome }}</button>
            <button
              v-if="catNome && !principali.some((c) => c.nome.toLowerCase() === catNome.toLowerCase())"
              type="button" class="chip on" @click="catNome = ''"
            ><span class="dot" />{{ catNome }} <span class="muted">(nuova)</span></button>
            <button v-if="principali.length > shownCats.length" type="button" class="chip ghost" @click="showAllCats = true">Altre {{ principali.length - shownCats.length }}…</button>
            <button type="button" class="chip ghost" @click="newCat = 'principale'">＋ Nuova</button>
          </div>
          <div v-if="newCat === 'principale'" class="row new-cat">
            <input v-model="newCatName" class="input" placeholder="Nome categoria" maxlength="60" autofocus @keydown.enter.prevent="confirmNewCat" />
            <button type="button" class="btn btn-sm" @click="confirmNewCat">OK</button>
          </div>
        </div>

        <label class="field">
          <span>Descrizione</span>
          <input v-model="descrizione" class="input" list="spese-descr" maxlength="500" placeholder="es. Supermercato" @change="onDescrizione" />
          <datalist id="spese-descr"><option v-for="d in descrizioni" :key="d" :value="d" /></datalist>
        </label>

        <div class="block">
          <span class="label">Data</span>
          <div class="chips">
            <button type="button" class="chip" :class="{ on: data === today() }" @click="data = today()">Oggi</button>
            <button type="button" class="chip" :class="{ on: data === addDays(today(), -1) }" @click="data = addDays(today(), -1)">Ieri</button>
            <input v-model="data" type="date" class="input date" aria-label="Data" required />
          </div>
        </div>

        <button type="button" class="more" :aria-expanded="details" @click="details = !details">
          {{ details ? '▾' : '▸' }} Conto, categoria secondaria, valuta
          <span v-if="!details && (conto || subNome)" class="muted">· {{ [conto, subNome].filter(Boolean).join(' · ') }}</span>
        </button>
        <template v-if="details">
          <label class="field">
            <span>Conto</span>
            <input v-model="conto" class="input" list="spese-conti" maxlength="80" placeholder="es. Carta, Contanti" />
            <datalist id="spese-conti"><option v-for="c in conti" :key="c" :value="c" /></datalist>
          </label>
          <div class="block">
            <span class="label">Categoria secondaria</span>
            <div class="chips">
              <button
                v-for="c in secondarie" :key="c.id" type="button" class="chip" :class="{ on: subNome === c.nome }"
                :style="{ '--c': colorOf(c) }" :aria-pressed="subNome === c.nome" @click="pickSub(c.nome)"
              ><span class="dot" />{{ c.nome }}</button>
              <button
                v-if="subNome && !secondarie.some((c) => c.nome.toLowerCase() === subNome.toLowerCase())"
                type="button" class="chip on" @click="subNome = ''"
              ><span class="dot" />{{ subNome }} <span class="muted">(nuova)</span></button>
              <button type="button" class="chip ghost" @click="newCat = 'secondaria'">＋ Nuova</button>
            </div>
            <div v-if="newCat === 'secondaria'" class="row new-cat">
              <input v-model="newCatName" class="input" placeholder="Nome categoria secondaria" maxlength="60" autofocus @keydown.enter.prevent="confirmNewCat" />
              <button type="button" class="btn btn-sm" @click="confirmNewCat">OK</button>
            </div>
          </div>
          <label class="field" style="max-width: 120px">
            <span>Valuta</span>
            <input v-model="valuta" class="input" maxlength="3" style="text-transform: uppercase" />
          </label>
        </template>
        <p v-if="willCreate.length" class="muted small" style="margin: 0">
          Verrà creata in «{{ spaceLabel(targetSpace) }}»: {{ willCreate.join(', ') }}
        </p>
      </div>

      <footer class="foot">
        <button v-if="isEdit" type="button" class="btn btn-ghost btn-danger" :disabled="busy" @click="remove">Elimina</button>
        <span class="spacer" />
        <button v-if="!isEdit" type="button" class="btn" :disabled="!valid || busy" @click="save(true)">Salva e nuova</button>
        <button type="submit" class="btn btn-primary" :disabled="!valid || busy">{{ busy ? 'Salvo…' : 'Salva' }}</button>
      </footer>
    </form>
  </div>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; z-index: 40; background: rgb(0 0 0 / .4); display: flex; align-items: flex-end; justify-content: center; }
.sheet {
  width: min(560px, 100%); max-height: 94vh; display: flex; flex-direction: column;
  background: var(--surface); border: 1px solid var(--border); border-radius: 18px 18px 0 0; box-shadow: var(--shadow);
}
@media (min-width: 640px) {
  .backdrop { align-items: center; padding: 16px; }
  .sheet { border-radius: var(--radius-lg); }
}
.head { display: flex; align-items: center; gap: 8px; padding: 12px 12px 4px 16px; }
.body { padding: 8px 16px 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
.foot { display: flex; align-items: center; gap: 8px; padding: 10px 16px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid var(--border); }

.seg { flex: 1; display: flex; padding: 3px; gap: 3px; background: var(--surface-2); border-radius: var(--radius); }
.seg-btn { flex: 1; padding: 8px; border: 0; border-radius: 8px; background: none; color: var(--muted); font: inherit; font-weight: 600; cursor: pointer; }
.seg-btn.on { background: var(--surface); box-shadow: var(--shadow); }
.seg-btn.out { color: var(--danger); }
.seg-btn.in { color: var(--ok); }

.amount { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border: 2px solid var(--border); border-radius: var(--radius-lg); }
.amount:focus-within { border-color: currentColor; }
.amount.out { color: var(--danger); }
.amount.in { color: var(--ok); }
.sign, .cur { font-size: 1.6rem; font-weight: 700; }
.cur { color: var(--muted); font-size: 1.2rem; }
.amount-input { flex: 1; min-width: 0; border: 0; outline: 0; background: none; color: inherit; font: inherit; font-size: 2rem; font-weight: 700; font-variant-numeric: tabular-nums; padding: 4px 0; }

.block { display: flex; flex-direction: column; gap: 6px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.chip {
  --c: var(--muted);
  display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 999px;
  border: 1px solid var(--border); background: var(--surface); color: var(--text); font: inherit; font-size: .92rem; cursor: pointer;
}
.chip:hover { background: var(--surface-2); }
.chip.on { border-color: var(--c); background: color-mix(in srgb, var(--c) 16%, var(--surface)); font-weight: 600; }
.chip.on:not([style]) { --c: var(--primary); }
.chip.ghost { border-style: dashed; color: var(--muted); }
.dot { width: 9px; height: 9px; border-radius: 50%; background: var(--c); flex-shrink: 0; }
.date { width: auto; padding: 6px 10px; }
.new-cat { flex-wrap: nowrap; }
.notice { margin: 0; padding: 8px 10px; border-radius: var(--radius); background: color-mix(in srgb, var(--warn) 14%, var(--surface)); color: var(--text); }
.more { align-self: flex-start; border: 0; background: none; color: var(--primary); font: inherit; font-size: .9rem; cursor: pointer; padding: 0; text-align: left; }
</style>
