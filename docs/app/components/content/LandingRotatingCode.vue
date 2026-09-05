<script setup lang="ts">
import type { HarnessEntry } from "../../utils/harnesses";
import { resolveGroup } from "../../utils/harnesses";

const props = defineProps<{ sample: HarnessEntry }>();

const OPTIONS = { platform: "linux", homeDir: "/home/dev", projectRoot: "/srv/app" } as const;

const fileName = computed(() => `${props.sample.id}.ts`);
const config = computed(() => resolveGroup(props.sample.config, OPTIONS)[0]?.path ?? "none");
const sessions = computed(() => resolveGroup(props.sample.sessions, OPTIONS)[0]?.path ?? "none");
const skills = computed(() => resolveGroup(props.sample.skills, OPTIONS)[0]?.path ?? "none");
const envVars = computed(() =>
  props.sample.detection.envVars.length > 0
    ? JSON.stringify(props.sample.detection.envVars.slice(0, 2))
    : "[] // project markers only",
);
</script>

<template>
  <div class="harnesses-frame overflow-hidden rounded-xl">
    <div class="flex items-center gap-2 border-b border-muted px-4 py-3">
      <span class="font-mono text-[10px] font-bold text-primary">TS</span>
      <span class="text-sm text-default">
        <Transition name="harnesses-roll" mode="out-in">
          <span :key="fileName">{{ fileName }}</span>
        </Transition>
      </span>
    </div>
    <pre
      class="harnesses-rotating"
    ><code><span class="tok-kw">import</span> { getHarness } <span class="tok-kw">from</span> <span class="tok-str">"@agntn/harnesses"</span>;

<span class="tok-cm">// <Transition name="harnesses-roll" mode="out-in"><span :key="sample.name" class="harnesses-roll-slot">{{ sample.name }}</span></Transition>, binary <Transition name="harnesses-roll" mode="out-in"><span :key="sample.binaries[0]" class="harnesses-roll-slot">{{ sample.binaries[0] }}</span></Transition></span>
<span class="tok-kw">const</span> harness = <span class="tok-fn">getHarness</span>(<span class="tok-str">"<Transition name="harnesses-roll" mode="out-in"><span :key="sample.id" class="harnesses-roll-slot">{{ sample.id }}</span></Transition>"</span>);

<span class="tok-kw">const</span> paths = harness.<span class="tok-fn">resolve</span>({ platform: <span class="tok-str">"linux"</span>, homeDir: <span class="tok-str">"/home/dev"</span> });
paths.config[0]?.path;    <span class="tok-cm">// "<Transition name="harnesses-roll" mode="out-in"><span :key="config" class="harnesses-roll-slot">{{ config }}</span></Transition>"</span>
paths.sessions[0]?.path;  <span class="tok-cm">// "<Transition name="harnesses-roll" mode="out-in"><span :key="sessions" class="harnesses-roll-slot">{{ sessions }}</span></Transition>"</span>
paths.skills[0]?.path;    <span class="tok-cm">// "<Transition name="harnesses-roll" mode="out-in"><span :key="skills" class="harnesses-roll-slot">{{ skills }}</span></Transition>"</span>

harness.detection.envVars; <span class="tok-cm">// <Transition name="harnesses-roll" mode="out-in"><span :key="envVars" class="harnesses-roll-slot">{{ envVars }}</span></Transition></span></code></pre>
  </div>
</template>
