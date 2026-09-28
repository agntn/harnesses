<script setup lang="ts">
defineProps<{ title?: string }>();
</script>

<template>
  <HarnessesCallout kind="tip" :title="title"><slot mdc-unwrap="p" /></HarnessesCallout>
</template>
