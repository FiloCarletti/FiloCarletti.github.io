<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], required: true },
  hint: { type: String, default: '' },
  // variazione rispetto al periodo precedente, es. "+12%"; il segno decide il colore
  delta: { type: String, default: '' },
})
</script>

<template>
  <div class="tile">
    <span class="tile-label">{{ label }}</span>
    <strong class="tile-value">{{ value }}</strong>
    <span v-if="hint || delta" class="tile-hint">
      <span v-if="delta" class="delta" :class="delta.startsWith('+') ? 'up' : delta.startsWith('-') ? 'down' : ''">
        {{ delta.startsWith('+') ? '▲' : delta.startsWith('-') ? '▼' : '' }} {{ delta.replace(/^[+-]/, '') }}
      </span>
      {{ hint }}
    </span>
  </div>
</template>

<style scoped>
.tile { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tile-label { font-size: .78rem; color: var(--muted); font-weight: 500; }
.tile-value { font-size: 1.45rem; line-height: 1.2; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tile-hint { font-size: .78rem; color: var(--muted); }
.delta { font-weight: 600; }
.delta.up { color: var(--ok); }
.delta.down { color: var(--danger); }
</style>
