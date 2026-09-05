<script setup lang="ts">
import { highlightJson, highlightShell, highlightTs } from "../../utils/highlight";

const props = defineProps<{ code: string; lang: "json" | "ts" | "shell" }>();

/** Markup our own tokenizer adds to escaped text; nothing typed into the page reaches the DOM raw. */
const html = computed(() => {
  switch (props.lang) {
    case "json":
      return highlightJson(props.code);
    case "ts":
      return highlightTs(props.code);
    default:
      return highlightShell(props.code);
  }
});
</script>

<template>
  <pre class="harnesses-snippet"><code v-html="html" /></pre>
</template>
