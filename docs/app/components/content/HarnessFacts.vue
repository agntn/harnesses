<script setup lang="ts">
import { harnessEntry, modeList } from "../../utils/harnesses";

const props = defineProps<{ id: string }>();

const entry = computed(() => harnessEntry(props.id));

const facts = computed(() => {
  const harness = entry.value;
  if (!harness) return [];
  const modes = modeList(harness);
  const userMcp = harness.mcpConfigs.find((file) => file.scope === "user") ?? harness.mcpConfigs[0];
  return [
    { label: "getHarness", value: `getHarness("${harness.id}")`, mono: true },
    { label: "binary", value: harness.invocation?.binary ?? harness.binaries.join(", "), mono: true },
    {
      label: "invoke modes",
      value: modes.length > 0 ? `${modes.length} of 6 · ${harness.invocation?.level}` : "none",
      mono: false,
    },
    { label: "model listing", value: harness.modelListing ? "native" : "no", mono: false },
    {
      label: "mcp config",
      value: userMcp ? `${userMcp.format} · ${userMcp.dialect}` : "unknown",
      mono: true,
    },
    { label: "agents file", value: harness.agentsFile ?? "none", mono: true },
  ];
});
</script>

<template>
  <dl
    v-if="facts.length > 0"
    class="harnesses-frame not-prose my-6 grid grid-cols-2 overflow-hidden rounded-xl sm:grid-cols-3"
  >
    <div
      v-for="(fact, index) in facts"
      :key="fact.label"
      class="border-muted px-4 py-3.5"
      :class="{
        'border-t': index >= 2,
        'sm:border-t-0': index < 3,
        'border-l': index % 2 === 1,
        'sm:border-l': index % 3 !== 0,
        'sm:border-l-0': index % 3 === 0,
      }"
    >
      <dt class="font-mono text-[10px] tracking-[0.12em] text-dimmed uppercase">
        {{ fact.label }}
      </dt>
      <dd
        class="mt-1 text-sm text-highlighted"
        :class="{ 'font-mono text-[13px] break-words': fact.mono }"
      >
        {{ fact.value }}
      </dd>
    </div>
  </dl>
</template>
