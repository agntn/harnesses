<script setup lang="ts">
/**
 * One clipped instrument shell with a tagged bar, the ruler, a body and an optional footer. The harness
 * sheet and the explorer stack several of these; each keeps its own content in the default slot.
 */
defineProps<{
  tag: string;
  title: string;
  meta?: string;
  label?: string;
}>();
</script>

<template>
  <section class="tool-console console-wide console-panel not-prose" :aria-label="label ?? title">
    <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
    <span class="console-cross console-cross-br" aria-hidden="true">+</span>
    <header class="console-bar">
      <span class="console-title"
        ><span class="console-tag">{{ tag }}</span
        ><slot name="title">{{ title }}</slot></span
      >
      <span v-if="meta" class="console-meta">{{ meta }}</span>
      <span class="console-mark" aria-hidden="true" />
    </header>
    <div class="console-ruler" aria-hidden="true"><slot name="cursor" /></div>
    <slot />
    <footer v-if="$slots.footer" class="console-footer console-footer-plain">
      <slot name="footer" />
    </footer>
  </section>
</template>

<style scoped>
.console-panel {
  margin-block: 20px;
}
.console-panel > .console-bar > .console-title {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
