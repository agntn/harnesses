<script setup lang="ts">
import type { HarnessEntry } from "../../utils/harnesses";
import { MODES, buildCommand, invocationError, shellLine } from "../../utils/harnesses";

const props = defineProps<{ sample: HarnessEntry }>();

const PROMPT = "Review this patch";

const cells = computed(() =>
  MODES.map((mode) => ({
    ...mode,
    supported: props.sample.invocationModes[mode.key],
    line: (() => {
      const built = buildCommand(props.sample, mode.key, PROMPT);
      return built ? shellLine(built) : null;
    })(),
  })),
);

const supportedCount = computed(() => cells.value.filter((cell) => cell.supported).length);
const shown = computed(() => cells.value.find((cell) => cell.supported));
const rejected = computed(() => cells.value.find((cell) => !cell.supported));
</script>

<template>
  <div class="harnesses-frame overflow-hidden rounded-xl">
    <div class="flex items-center justify-between gap-3 border-b border-muted px-4 py-3">
      <p class="font-mono text-xs text-muted">
        <span class="text-dimmed">invocationModes</span>
        <span class="ms-2 text-highlighted">{{ sample.id }}</span>
      </p>
      <p class="font-mono text-[11px] text-dimmed">{{ supportedCount }} of {{ MODES.length }}</p>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-3">
      <div
        v-for="(cell, i) in cells"
        :key="cell.key"
        class="border-muted px-4 py-3 transition-colors duration-500"
        :class="{
          'border-t': i >= 2,
          'sm:border-t-0': i < 3,
          'border-l': i % 2 === 1,
          'sm:border-l': i % 3 !== 0,
          'sm:border-l-0': i % 3 === 0,
          'harnesses-cell-active': cell.supported,
        }"
      >
        <p class="flex items-center gap-2 font-mono text-[11px] tracking-[0.08em] uppercase" :class="cell.supported ? 'text-primary' : 'text-dimmed'">
          <UIcon
            :name="cell.supported ? 'i-solar-unread-linear' : 'i-solar-close-circle-linear'"
            class="size-3.5"
          />
          {{ cell.label }}
        </p>
        <p class="mt-1 font-mono text-[11px] text-dimmed">{{ cell.options }}</p>
      </div>
    </div>
    <div class="divide-y divide-muted border-t border-muted">
      <div class="px-4 py-3.5">
        <p class="harnesses-eyebrow mb-2">{{ shown ? `${shown.label} · spawned` : "no headless mode" }}</p>
        <pre :key="sample.id" class="harnesses-tool harnesses-derive"><code>{{ shown?.line ?? `invoke() rejects: ${invocationError(sample, "agent")}` }}</code></pre>
      </div>
      <div v-if="rejected" class="px-4 py-3.5">
        <p class="harnesses-eyebrow mb-2">{{ rejected.label }} · rejected</p>
        <pre :key="`${sample.id}-rejected`" class="harnesses-tool harnesses-derive"><code>{{ invocationError(sample, rejected.key) }}</code></pre>
      </div>
    </div>
  </div>
</template>
