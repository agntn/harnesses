<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import { HARNESSES, allPaths, type HarnessEntry } from "../../utils/harnesses";
import { ROSTER_CLASS, ROSTER_TABLE_UI } from "../../utils/roster";

interface Row {
  id: string;
  name: string;
  icon: string;
  to: string;
  detection: string;
  headless: string;
  sessions: string;
  paths: number;
  inferred: number;
}

/** The mode families a harness can run, without the structured variants that pair with them. */
function families(harness: HarnessEntry): string {
  const modes = harness.invocationModes;
  const names = [
    modes.advisor || modes.advisorStructured ? "advisor" : "",
    modes.readOnly || modes.readOnlyStructured ? "read-only" : "",
    modes.agent || modes.agentStructured ? "agent" : "",
  ].filter(Boolean);
  return names.length > 0 ? names.join(", ") : "none";
}

const ROWS: Row[] = HARNESSES.map((harness) => {
  const paths = allPaths(harness);
  return {
    id: harness.id,
    name: harness.name,
    icon: harness.icon,
    to: harness.to,
    detection: harness.detection.envVars.length > 0 ? "env + project" : "project",
    headless: families(harness),
    sessions: [...new Set(harness.persistence.map((item) => item.format))].join(", ") || "none",
    paths: paths.length,
    inferred: paths.filter((entry) => entry.level === "inferred").length,
  };
}).toSorted((a, b) => a.name.localeCompare(b.name));

/** Empty until a header is clicked: the rows then keep alphabetical order. */
const sorting = ref<{ id: string; desc: boolean }[]>([]);

const roster = useTemplateRef<HTMLElement>("roster");
useRosterFlip(
  () => roster.value,
  () => sorting.value,
);

const columns: TableColumn<Row>[] = [
  {
    accessorKey: "name",
    header: "Harness",
    sortingFn: "text",
    meta: { class: { th: "w-[12rem]" } },
  },
  /* Narrow, the row reads name and evidence first, then the three facts. */
  {
    accessorKey: "detection",
    header: "Detection",
    enableSorting: false,
    meta: { class: { th: "w-[8.5rem]", td: "@max-[52rem]/roster:order-2" } },
  },
  {
    accessorKey: "headless",
    header: "Headless",
    enableSorting: false,
    meta: { class: { td: "@max-[52rem]/roster:order-3" } },
  },
  {
    accessorKey: "sessions",
    header: "Sessions",
    enableSorting: false,
    meta: { class: { td: "@max-[52rem]/roster:order-4" } },
  },
  {
    accessorKey: "inferred",
    header: "Evidence",
    meta: {
      class: {
        th: "w-[11.5rem]",
        td: "@max-[52rem]/roster:order-1 @max-[52rem]/roster:col-span-1! @max-[52rem]/roster:justify-self-end",
      },
    },
  },
];

const order = computed(() => {
  const [first] = sorting.value;
  if (first === undefined) return "by name";
  const label = columns.find(
    (column) => "accessorKey" in column && column.accessorKey === first.id,
  )?.header;
  return `by ${String(label).toLowerCase()} ${first.desc ? "descending" : "ascending"}`;
});
</script>

<template>
  <section ref="roster" class="roster not-prose my-6" aria-label="Harnesses">
    <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
    <span class="console-cross console-cross-br" aria-hidden="true">+</span>
    <header :class="ROSTER_CLASS.bar">
      <span :class="ROSTER_CLASS.title">getAllHarnesses()</span>
      <span :class="ROSTER_CLASS.meta">{{ ROWS.length }} harnesses · {{ order }}</span>
    </header>
    <div class="roster-ruler" aria-hidden="true" />
    <UTable
      v-model:sorting="sorting"
      :data="ROWS"
      :columns="columns"
      :get-row-id="(row) => row.id"
      :ui="ROSTER_TABLE_UI"
    >
      <template #name-header="{ column }"><RosterSort :column="column" label="Harness" /></template>
      <template #inferred-header="{ column }"
        ><RosterSort :column="column" label="Evidence"
      /></template>
      <template #name-cell="{ row }">
        <NuxtLink :to="row.original.to" :class="[ROSTER_CLASS.name, 'items-baseline']">
          <UIcon
            :name="row.original.icon"
            class="relative top-0.5 size-3.5 flex-none"
            aria-hidden="true"
          />
          <span>{{ row.original.name }}</span>
        </NuxtLink>
        <div class="mt-1 pl-5.5">
          <span :class="ROSTER_CLASS.id">{{ row.original.id }}</span>
        </div>
      </template>
      <template #detection-cell="{ row }">
        <span class="text-muted">{{ row.original.detection }}</span>
      </template>
      <template #headless-cell="{ row }">
        <span :class="row.original.headless === 'none' ? 'text-dimmed' : 'text-muted'">{{
          row.original.headless
        }}</span>
      </template>
      <template #sessions-cell="{ row }">
        <span :class="ROSTER_CLASS.about">{{ row.original.sessions }}</span>
      </template>
      <template #inferred-cell="{ row }">
        <span :class="ROSTER_CLASS.count"
          ><span :class="ROSTER_CLASS.leader" aria-hidden="true" /><span class="whitespace-nowrap"
            ><span
              :class="row.original.inferred > 0 ? 'text-(--console-accent)' : 'text-highlighted'"
              >{{ row.original.inferred }}</span
            >
            of {{ row.original.paths }} inferred</span
          ></span
        >
      </template>
    </UTable>
    <footer :class="ROSTER_CLASS.footer">
      <span>read from the registry / no network</span>
      <span :class="ROSTER_CLASS.meta">getHarness("&lt;id&gt;") returns one</span>
    </footer>
  </section>
</template>
