<script setup lang="ts">
import type { PathCandidate } from "../../utils/harnesses";

defineProps<{
  group: string;
  entries: readonly PathCandidate[];
  /** Shown beside the group name, e.g. how many entries the platform filter hid. */
  aside?: string;
  /** Show the platform tag; off when the entries are already resolved for one platform. */
  platforms?: boolean;
}>();

function tags(entry: PathCandidate, platforms: boolean | undefined): string {
  const parts = [entry.scope, entry.level];
  if (platforms) parts.push(entry.platforms ? entry.platforms.join(", ") : "all");
  return parts.join(" · ");
}
</script>

<template>
  <div class="px-4 py-3.5">
    <div class="mb-2 flex items-center justify-between">
      <p class="harnesses-eyebrow">{{ group }}</p>
      <p v-if="aside" class="font-mono text-[11px] text-dimmed">{{ aside }}</p>
    </div>
    <ul v-if="entries.length > 0" class="space-y-1.5">
      <li
        v-for="entry in entries"
        :key="entry.path"
        class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5"
      >
        <code class="font-mono text-[13px] break-all text-highlighted">{{ entry.path }}</code>
        <span class="font-mono text-[10px] tracking-[0.08em] text-dimmed uppercase">{{
          tags(entry, platforms)
        }}</span>
        <span v-if="entry.note" class="basis-full text-xs text-muted">{{ entry.note }}</span>
      </li>
    </ul>
    <p v-else class="font-mono text-[11px] text-dimmed">none mapped</p>
  </div>
</template>
