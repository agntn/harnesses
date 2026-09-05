<script setup lang="ts">
import type { HarnessEntry } from "../../utils/harnesses";
import { HARNESSES } from "../../utils/harnesses";

const props = defineProps<{ sample: HarnessEntry }>();

/** User-scope MCP config files, the targets `syncMcpServers` rewrites. */
const targets = HARNESSES.flatMap((harness) =>
  harness.mcpConfigs
    .filter((file) => file.scope === "user")
    .map((file) => ({ id: harness.id, short: harness.short, ...file })),
);

const MASTER = `{
  "excludes": ["codex"],
  "mcpServers": {
    "harnesses": {
      "command": "npx",
      "args": ["-y", "@agntn/harnesses", "mcp"]
    }
  }
}`;

const activeTarget = computed(() => targets.find((target) => target.id === props.sample.id));
</script>

<template>
  <div class="harnesses-frame overflow-hidden rounded-xl">
    <div class="flex items-center justify-between gap-3 border-b border-muted px-4 py-3">
      <p class="font-mono text-xs text-muted">
        <span class="text-dimmed">master</span>
        <span class="ms-2 text-highlighted">~/.config/agntn/mcp.jsonc</span>
      </p>
      <p class="font-mono text-[11px] text-dimmed">{{ targets.length }} targets</p>
    </div>
    <div class="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <CodeSnippet :code="MASTER" lang="json" class="border-b border-muted sm:border-r sm:border-b-0" />
      <ul class="divide-y divide-muted">
        <li
          v-for="target in targets"
          :key="`${target.id}-${target.path}`"
          class="flex items-center gap-3 px-4 py-2 transition-colors duration-500"
          :class="{ 'harnesses-cell-active': target.id === sample.id }"
        >
          <UIcon
            name="i-solar-arrow-right-linear"
            class="size-3.5 shrink-0"
            :class="target.id === sample.id ? 'text-primary' : 'text-dimmed'"
          />
          <span class="min-w-0 flex-1 truncate font-mono text-[11px]" :class="target.id === sample.id ? 'text-highlighted' : 'text-muted'">{{ target.path }}</span>
          <span class="harnesses-chip" :class="{ 'harnesses-chip-ok': target.id === sample.id }">{{ target.format }} · {{ target.dialect }}</span>
        </li>
      </ul>
    </div>
    <div class="border-t border-muted px-4 py-3 font-mono text-[11px] text-dimmed">
      <template v-if="activeTarget">
        {{ sample.short }}: <span class="text-muted">{{ activeTarget.format === "toml" ? "surgical TOML edit, comments kept" : `JSON rewritten under ${activeTarget.key.join(".")}` }}</span>
      </template>
      <template v-else>{{ sample.short }}: <span class="text-muted">no known MCP config file, skipped by sync</span></template>
    </div>
  </div>
</template>
