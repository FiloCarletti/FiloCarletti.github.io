<script setup>
// Foto profilo Google, o iniziali su colore stabile se manca.
import { computed, ref } from 'vue'

const props = defineProps({
  name: { type: String, default: '' },
  src: { type: String, default: '' },
  size: { type: Number, default: 28 },
})
const broken = ref(false)
const initials = computed(() => props.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?')
const hue = computed(() => [...props.name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7))
</script>

<template>
  <img
    v-if="src && !broken" :src="src" :alt="name" class="av" :style="{ width: `${size}px`, height: `${size}px` }"
    referrerpolicy="no-referrer" @error="broken = true"
  />
  <span
    v-else class="av av-initials" :aria-label="name"
    :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.4}px`, '--h': hue }"
  >{{ initials }}</span>
</template>

<style scoped>
.av { border-radius: 50%; flex-shrink: 0; object-fit: cover; border: 2px solid var(--surface); box-sizing: border-box; }
.av-initials { display: inline-grid; place-items: center; font-weight: 600; color: #fff; background: hsl(var(--h) 45% 45%); }
</style>
