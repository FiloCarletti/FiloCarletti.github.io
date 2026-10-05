<script setup>
// Barra sotto l'header: quale spazio di dati si sta guardando. Compare solo se
// ci sono più spazi o se quello corrente è in sola lettura.
import { computed } from 'vue'
import { spaceLabel, useSpace } from '../spaces.js'

const { spaces, current, spaceId, canWrite, setSpace } = useSpace()
const visible = computed(() => spaces.value.length > 1 || (current.value && !canWrite.value))
const icon = (s) => (s?.kind === 'shared' ? '👥' : s?.role === 'owner' ? '👤' : '👁️')
</script>

<template>
  <div v-if="visible" class="spacebar">
    <span class="sb-icon" aria-hidden="true">{{ icon(current) }}</span>
    <label class="sb-label" for="space-select">Dati</label>
    <select
      v-if="spaces.length > 1" id="space-select" class="select sb-select" :value="spaceId"
      @change="setSpace($event.target.value)"
    >
      <option v-for="s in spaces" :key="s.id" :value="s.id">
        {{ s.role === 'viewer' ? '👁 ' : '' }}{{ spaceLabel(s) }}
      </option>
    </select>
    <strong v-else>{{ spaceLabel(current) }}</strong>
    <span v-if="!canWrite" class="badge">sola lettura</span>
  </div>
</template>

<style scoped>
.spacebar {
  display: flex; align-items: center; gap: 8px; margin: -8px 0 14px; padding: 6px 10px;
  border: 1px dashed var(--border); border-radius: var(--radius); font-size: .9rem;
}
.sb-label { color: var(--muted); font-size: .85rem; }
.sb-select { width: auto; flex: 1; min-width: 0; max-width: 280px; padding: 5px 9px; }
</style>
