<script setup>
// Valore numerico con − e + grandi, comodo in palestra con le mani occupate.
const props = defineProps({
  modelValue: { type: Number, default: 0 },
  label: { type: String, required: true },
  step: { type: Number, default: 1 },
  min: { type: Number, default: 0 },
  suffix: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])
const round = (x) => Math.round(x * 100) / 100
const set = (x) => emit('update:modelValue', Math.max(props.min, round(Number.isFinite(x) ? x : props.min)))
function onInput(ev) {
  const x = Number(String(ev.target.value).replace(',', '.'))
  if (Number.isFinite(x)) set(x)
}
</script>

<template>
  <div class="stepper" role="group" :aria-label="label">
    <span class="lbl">{{ label }}</span>
    <div class="ctl">
      <button type="button" class="btn" :aria-label="`${label}: meno ${step}`" @click="set(modelValue - step)">−</button>
      <input :value="String(modelValue).replace('.', ',')" inputmode="decimal" class="input" :aria-label="label" @change="onInput" />
      <button type="button" class="btn" :aria-label="`${label}: più ${step}`" @click="set(modelValue + step)">+</button>
    </div>
    <span v-if="suffix" class="suf">{{ suffix }}</span>
  </div>
</template>

<style scoped>
.stepper { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; }
.lbl, .suf { font-size: .75rem; color: var(--muted); text-transform: uppercase; letter-spacing: .03em; }
.ctl { display: flex; align-items: stretch; gap: 4px; width: 100%; }
.ctl .btn { width: 44px; min-height: 44px; padding: 0; justify-content: center; font-size: 1.3rem; flex-shrink: 0; }
.ctl .input { text-align: center; font-size: 1.25rem; font-weight: 600; font-variant-numeric: tabular-nums; padding: 6px 2px; min-width: 0; }
</style>
