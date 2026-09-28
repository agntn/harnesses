<script setup lang="ts">
defineProps<{ title?: string }>();
</script>

<template>
  <HarnessesCallout kind="note" :title="title"><slot mdc-unwrap="p" /></HarnessesCallout>
</template>
