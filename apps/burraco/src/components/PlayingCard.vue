<script setup>
import { computed } from 'vue'
import { RED, SUITS, cardLabel, isJoker, rankLabel, suitOf } from '../game/cards.js'

const props = defineProps({
  id: { type: Number, default: null },
  size: { type: String, default: 'md' }, // sm | md
  selected: Boolean,
  fresh: Boolean, // appena pescata
  hinted: Boolean,
  back: Boolean, // coperta
  disabled: Boolean,
  interactive: Boolean,
})
defineEmits(['tap'])

const joker = computed(() => props.id != null && isJoker(props.id))
const suit = computed(() => (props.id == null || joker.value ? '' : SUITS[suitOf(props.id)]))
const red = computed(() => props.id != null && !joker.value && RED[suitOf(props.id)])
const rank = computed(() => (props.id == null ? '' : joker.value ? 'JK' : rankLabel(props.id)))
</script>

<template>
  <component
    :is="interactive ? 'button' : 'span'"
    :type="interactive ? 'button' : undefined"
    class="pc"
    :class="[size, { back, selected, fresh, hinted, red, joker, disabled }]"
    :aria-label="back ? 'Carta coperta' : cardLabel(id)"
    :aria-pressed="interactive ? selected : undefined"
    :disabled="interactive && disabled"
    @click="interactive && $emit('tap', id)"
  >
    <template v-if="!back">
      <span class="corner">{{ rank }}<small v-if="suit">{{ suit }}</small></span>
      <span class="pip">{{ joker ? '★' : suit }}</span>
    </template>
  </component>
</template>

<style scoped>
.pc {
  --w: 46px; --h: 66px;
  position: relative; display: inline-flex; flex-direction: column; justify-content: space-between;
  width: var(--w); height: var(--h); flex-shrink: 0; padding: 3px 4px;
  border-radius: 7px; border: 1px solid #c9ced8; background: #fff; color: #1d2330;
  font: 600 15px/1 var(--font); box-shadow: 0 1px 2px rgb(0 0 0 / .18); user-select: none;
  transition: transform .12s, box-shadow .12s;
}
button.pc { cursor: pointer; }
.pc.sm { --w: 30px; --h: 42px; font-size: 11.5px; padding: 2px 3px; border-radius: 5px; }
.pc.red { color: #d0263c; }
.pc.joker { color: #7b3fc4; }
.corner { display: flex; flex-direction: column; align-items: center; width: max-content; letter-spacing: -.02em; }
.corner small { font-size: .85em; line-height: 1; }
.pip { position: absolute; right: 4px; bottom: 3px; font-size: 22px; line-height: 1; }
.sm .pip { font-size: 13px; right: 3px; bottom: 2px; }
.sm .corner small { font-size: 10px; margin-top: 1px; }
.back {
  background: repeating-linear-gradient(45deg, #3b5bdb 0 5px, #4c6ef5 5px 10px); border-color: #2f4ac0;
}
.selected { transform: translateY(-12px); box-shadow: 0 0 0 2px var(--primary), 0 6px 14px rgb(0 0 0 / .25); }
.sm.selected { transform: translateY(-6px); }
.fresh:not(.selected) { box-shadow: 0 0 0 2px #f59f00, 0 1px 2px rgb(0 0 0 / .18); }
.hinted { box-shadow: 0 0 0 2px #2f9e44, 0 4px 10px rgb(0 0 0 / .2); }
.disabled { opacity: .55; }
@media (prefers-color-scheme: dark) {
  .pc:not(.back) { background: #f3f4f7; border-color: #9aa3b2; }
}
@media (max-width: 380px) {
  .pc.md { --w: 42px; --h: 60px; font-size: 14px; }
  .pc.md .pip { font-size: 19px; }
}
</style>
