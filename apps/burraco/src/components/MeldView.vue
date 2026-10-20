<script setup>
import { computed } from 'vue'
import { analyzeMeld, burracoKind } from '../game/melds.js'
import PlayingCard from './PlayingCard.vue'

const props = defineProps({
  meld: { type: Object, required: true },
  target: Boolean, // si possono attaccare le carte selezionate
  hinted: Boolean,
  interactive: Boolean,
  semi: Boolean, // regola del burraco semipulito attiva
})
defineEmits(['tap'])

const a = computed(() => analyzeMeld(props.meld.cards, props.meld.type))
const order = computed(() => a.value?.order ?? props.meld.cards)
const kind = computed(() => burracoKind(a.value, props.semi))
const burraco = computed(() => !!kind.value)
const TAGS = { pulito: 'P', semipulito: 'SP', sporco: 'S' }
const label = computed(() => {
  const n = props.meld.cards.length
  if (burraco.value) return `Burraco ${kind.value}`
  return `${props.meld.type === 'seq' ? 'Scala' : 'Tris'} di ${n}${a.value && !a.value.clean ? ', sporca' : ''}`
})
</script>

<template>
  <component
    :is="interactive ? 'button' : 'div'"
    :type="interactive ? 'button' : undefined"
    class="meld"
    :class="{ target, hinted, burraco, clean: kind === 'pulito', semi: kind === 'semipulito' }"
    :aria-label="interactive ? `Attacca a: ${label}` : label"
    :title="label"
    @click="interactive && $emit('tap', meld.id)"
  >
    <span class="cards">
      <PlayingCard v-for="c in order" :key="c" :id="c" size="sm" />
    </span>
    <span v-if="burraco" class="tag">{{ TAGS[kind] }}</span>
  </component>
</template>

<style scoped>
.meld {
  position: relative; display: inline-flex; align-items: center; padding: 4px 6px 4px 4px; border-radius: 8px;
  border: 1px dashed transparent; background: transparent; font: inherit; color: inherit;
}
button.meld { cursor: pointer; }
.cards { display: inline-flex; }
.cards > * + * { margin-left: -17px; }
.target { border-color: var(--primary); background: var(--primary-soft); }
.hinted { border-color: #2f9e44; border-style: solid; }
.burraco { background: color-mix(in srgb, #adb5bd 20%, transparent); }
.burraco.clean { background: color-mix(in srgb, #fab005 22%, transparent); }
.target.burraco { background: var(--primary-soft); }
.tag {
  position: absolute; top: -6px; right: -4px; min-width: 17px; height: 17px; padding: 0 4px; border-radius: 9px;
  font-size: 10.5px; font-weight: 700; line-height: 17px; text-align: center; background: #868e96; color: #fff;
}
.clean .tag { background: #e8a200; }
.burraco.semi { background: color-mix(in srgb, #fab005 11%, transparent); }
.semi .tag { background: #b08a3e; }
</style>
