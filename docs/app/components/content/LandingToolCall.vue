<script setup lang="ts">
import type { HarnessEntry } from "../../utils/harnesses";
import { capabilityList, modeList } from "../../utils/harnesses";

const props = defineProps<{ sample: HarnessEntry }>();

const caps = computed(() => JSON.stringify(capabilityList(props.sample)));
const modes = computed(() => JSON.stringify(modeList(props.sample)));
const binaries = computed(() => JSON.stringify(props.sample.binaries));
</script>

<template>
  <div class="harnesses-frame overflow-hidden rounded-xl">
    <div class="flex items-center justify-between gap-3 border-b border-muted px-4 py-3">
      <p class="font-mono text-xs text-muted">
        <span class="text-dimmed">tool</span>
        <span class="ms-2 text-highlighted">harnesses_info</span>
      </p>
      <p class="font-mono text-[11px] text-dimmed">MCP · Pi · OMP</p>
    </div>
    <div class="divide-y divide-muted">
      <div class="px-4 py-4">
        <p class="harnesses-eyebrow mb-3">input</p>
        <pre class="harnesses-tool"><code>{
  <span class="tok-key">"id"</span>: <span class="tok-str">"<Transition name="harnesses-roll" mode="out-in"><span :key="sample.id" class="harnesses-roll-slot">{{ sample.id }}</span></Transition>"</span>
}</code></pre>
      </div>
      <div class="px-4 py-4">
        <p class="harnesses-eyebrow mb-3">output</p>
        <pre :key="sample.id" class="harnesses-tool harnesses-derive"><code>{
  <span class="tok-key">"id"</span>: <span class="tok-str">"{{ sample.id }}"</span>,
  <span class="tok-key">"name"</span>: <span class="tok-str">"{{ sample.name }}"</span>,
  <span class="tok-key">"binaries"</span>: <span class="tok-str">{{ binaries }}</span>,
  <span class="tok-key">"capabilities"</span>: <span class="tok-str">{{ caps }}</span>,
  <span class="tok-key">"invocationModes"</span>: <span class="tok-str">{{ modes }}</span>,
  <span class="tok-key">"modelListing"</span>: <span class="tok-kw">{{ sample.modelListing !== null }}</span>,
  <span class="tok-key">"agentsFile"</span>: <span :class="sample.agentsFile ? 'tok-str' : 'tok-kw'">{{ sample.agentsFile ? `"${sample.agentsFile}"` : "null" }}</span>,
  <span class="tok-key">"paths"</span>: <span class="tok-cm">{ config, sessions, instructions, skills, commands, hooks }</span>
}</code></pre>
      </div>
    </div>
  </div>
</template>
