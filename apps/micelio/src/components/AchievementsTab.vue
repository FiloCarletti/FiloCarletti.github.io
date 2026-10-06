<script setup>
import { computed } from 'vue'
import { ACH_BONUS, ACHIEVEMENTS } from '../game/data.js'
import { game } from '../game/store.js'
import { fmtPct } from '../game/format.js'

const date = new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short' })
const list = computed(() => ACHIEVEMENTS.map((a) => ({ ...a, at: game.value.ach[a.id] ?? null })))
const got = computed(() => list.value.filter((a) => a.at).length)
</script>

<template>
  <div class="stack">
    <div class="card row-between">
      <span><strong>{{ got }}</strong> / {{ list.length }} traguardi</span>
      <span class="badge badge-primary">Produzione +{{ fmtPct(got * ACH_BONUS) }}</span>
    </div>
    <p class="muted small" style="margin: 0">Ogni traguardo dà +{{ fmtPct(ACH_BONUS) }} di produzione, per sempre.</p>
    <div class="grid-ach">
      <div v-for="a in list" :key="a.id" class="ach" :class="{ on: a.at }" :title="a.desc">
        <span class="ach-icon">{{ a.at ? a.icon : '🔒' }}</span>
        <div style="min-width: 0">
          <div class="small ach-name">{{ a.name }}</div>
          <div class="muted ach-desc">{{ a.at ? date.format(new Date(a.at)) : a.desc }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.grid-ach { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); }
.ach { display: flex; gap: 10px; align-items: center; padding: 8px 10px; border-radius: var(--radius); border: 1px dashed var(--border); opacity: .7; }
.ach.on { opacity: 1; border-style: solid; background: var(--surface); box-shadow: var(--shadow); }
.ach-icon { font-size: 1.3rem; width: 28px; text-align: center; flex-shrink: 0; }
.ach-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ach-desc { font-size: .75rem; line-height: 1.3; }
</style>
