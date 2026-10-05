<script setup>
import { catColor } from '../lib/categories.js'
defineProps({ cat: { type: String, required: true }, label: { type: Boolean, default: true } })
</script>

<template>
  <span class="badge cat"><i :style="{ background: catColor(cat) }" />{{ label ? cat : '' }}</span>
</template>

<style scoped>
.cat i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
</style>
