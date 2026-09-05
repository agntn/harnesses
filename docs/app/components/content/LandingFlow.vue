<script setup lang="ts">
import type { HarnessEntry } from "../../utils/harnesses";
import { HARNESSES, buildCommand, modeList, modeSpec, shellArgs } from "../../utils/harnesses";
import { clip } from "../../utils/format";

const props = defineProps<{ sample: HarnessEntry; tick: number }>();

const W = 1200;
const H = 470;
const CALL = { x: 24, y: 150, w: 340, h: 170 };
const NODE = { x: 510, w: 200, h: 28, gap: 9 };
const RESULT = { x: 870, y: 40, w: 306, h: 390 };
const PROMPT = "Review this patch";

const nodes = computed(() =>
  HARNESSES.map((harness, index) => ({
    id: harness.id,
    label: harness.short,
    y: 13 + index * (NODE.h + NODE.gap),
    active: harness.id === props.sample.id,
  })),
);

function curvePath(x1: number, y1: number, x2: number, y2: number) {
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}

const trunkPaths = computed(() =>
  nodes.value.map((node) => ({
    d: curvePath(CALL.x + CALL.w, CALL.y + CALL.h / 2, NODE.x, node.y + NODE.h / 2),
    active: node.active,
  })),
);

const branchPaths = computed(() =>
  nodes.value.map((node) => ({
    d: curvePath(NODE.x + NODE.w, node.y + NODE.h / 2, RESULT.x, RESULT.y + RESULT.h / 2),
    active: node.active,
  })),
);

/** The first mode the harness supports, in the library's own preference order. */
const mode = computed(() => modeList(props.sample)[0]);
const built = computed(() => (mode.value ? buildCommand(props.sample, mode.value, PROMPT) : null));
const optionsLiteral = computed(() =>
  mode.value ? modeSpec(mode.value).options : "no headless mode",
);

const rows = computed(() => {
  if (!built.value) {
    return [
      [{ label: "invoke", value: "rejected before spawn" }],
      [{ label: "reason", value: `no non-interactive invocation` }],
      [{ label: "invocationModes", value: "all false" }],
    ];
  }
  return [
    [
      { label: "exitCode", value: "0" },
      { label: "timedOut · aborted", value: "false · false" },
    ],
    [{ label: "args", value: clip(shellArgs(built.value.args), 40) }],
    [{ label: "mode", value: `${mode.value} · ${props.sample.invocation?.level ?? ""}` }],
  ];
});

const commandLine = computed(() => (built.value ? built.value.command : "invoke() rejects"));

/** Space Mono is about 0.62 em wide per glyph; shrink the text until it fits the box. */
function fit(text: string, width: number, max: number) {
  return Math.min(max, Math.floor(width / (Math.max(text.length, 1) * 0.62)));
}
const outputSize = computed(() => fit(commandLine.value, RESULT.w - 36, 22));
</script>

<template>
  <svg
    :viewBox="`0 0 ${W} ${H}`"
    class="harnesses-flow"
    role="img"
    aria-label="One invoke call is routed to the selected harness's CLI and comes back as one InvokeResult shape"
  >
    <g class="harnesses-flow-wires">
      <path
        v-for="(path, index) in trunkPaths"
        :key="`t${index}`"
        :d="path.d"
        :class="{ 'harnesses-flow-wire-dim': !path.active }"
      />
      <path
        v-for="(path, index) in branchPaths"
        :key="`b${index}`"
        :d="path.d"
        :class="{ 'harnesses-flow-wire-dim': !path.active }"
      />
    </g>
    <g :key="tick" class="harnesses-flow-pulses">
      <template v-for="(path, index) in trunkPaths" :key="`pt${index}`">
        <path v-if="path.active" :d="path.d" class="harnesses-flow-pulse" />
      </template>
      <template v-for="(path, index) in branchPaths" :key="`pb${index}`">
        <path
          v-if="path.active"
          :d="path.d"
          class="harnesses-flow-pulse harnesses-flow-pulse-late"
        />
      </template>
    </g>

    <g class="harnesses-flow-node">
      <rect :x="CALL.x" :y="CALL.y" :width="CALL.w" :height="CALL.h" rx="10" />
      <text :x="CALL.x + 18" :y="CALL.y + 30" class="harnesses-flow-label">
        invoke(prompt, options)
      </text>
      <text :x="CALL.x + 18" :y="CALL.y + 70" class="harnesses-flow-domain harnesses-flow-accent">
        "{{ PROMPT }}"
      </text>
      <text :x="CALL.x + 18" :y="CALL.y + 104" class="harnesses-flow-mono">
        getHarness("<tspan :key="sample.id" class="harnesses-derive">{{ sample.id }}</tspan>")
      </text>
      <text :x="CALL.x + 18" :y="CALL.y + 132" class="harnesses-flow-label">
        <tspan :key="optionsLiteral" class="harnesses-derive">{{ optionsLiteral }}</tspan>
      </text>
    </g>

    <g
      v-for="node in nodes"
      :key="node.id"
      class="harnesses-flow-node"
      :class="{ 'harnesses-flow-dim': !node.active }"
    >
      <rect :x="NODE.x" :y="node.y" :width="NODE.w" :height="NODE.h" rx="7" />
      <text :x="NODE.x + 14" :y="node.y + 19" class="harnesses-flow-small">{{ node.label }}</text>
    </g>

    <g class="harnesses-flow-node">
      <rect :x="RESULT.x" :y="RESULT.y" :width="RESULT.w" :height="RESULT.h" rx="10" />
      <text :x="RESULT.x + 18" :y="RESULT.y + 28" class="harnesses-flow-label">InvokeResult</text>
      <text
        :x="RESULT.x + RESULT.w - 18"
        :y="RESULT.y + 28"
        text-anchor="end"
        class="harnesses-flow-mono"
      >
        {{ sample.short }}
      </text>
      <line
        :x1="RESULT.x + 1"
        :x2="RESULT.x + RESULT.w - 1"
        :y1="RESULT.y + 44"
        :y2="RESULT.y + 44"
        class="harnesses-flow-rule"
      />
      <text :x="RESULT.x + 18" :y="RESULT.y + 68" class="harnesses-flow-label">command</text>
      <text
        :x="RESULT.x + 18"
        :y="RESULT.y + 96"
        class="harnesses-flow-domain harnesses-flow-accent"
        :style="{ fontSize: `${outputSize}px` }"
      >
        <tspan :key="commandLine" class="harnesses-derive">{{ commandLine }}</tspan>
      </text>
      <template v-for="(row, rowIndex) in rows" :key="`${sample.id}-${rowIndex}`">
        <g v-for="(field, column) in row" :key="field.label" class="harnesses-derive">
          <text
            :x="RESULT.x + 18 + column * 140"
            :y="RESULT.y + 136 + rowIndex * 56"
            class="harnesses-flow-label"
          >
            {{ field.label }}
          </text>
          <text
            :x="RESULT.x + 18 + column * 140"
            :y="RESULT.y + 156 + rowIndex * 56"
            class="harnesses-flow-small"
          >
            {{ field.value }}
          </text>
        </g>
      </template>
    </g>
  </svg>
</template>
