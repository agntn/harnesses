<script setup lang="ts">
import type { HarnessEntry } from "../../utils/harnesses";
import { HARNESSES, resolveGroup } from "../../utils/harnesses";
import { tokens } from "../../utils/tokens";

const props = defineProps<{ sample: HarnessEntry }>();

const emit = defineEmits<{ step: [delta: number] }>();

const OPTIONS = { platform: "linux", homeDir: "/home/dev", projectRoot: "/srv/app" } as const;

const { copied, copy } = useCopied();

/** Every sample gets the same twelve lines, so the file keeps one height while the harness changes. */
const lines = computed(() => {
  const first = (group: "config" | "sessions" | "instructions" | "skills" | "hooks") =>
    resolveGroup(props.sample[group], OPTIONS)[0]?.path;
  const quoted = (value: string | undefined) => (value === undefined ? "undefined" : `"${value}"`);
  const env = props.sample.detection.envVars;
  return [
    'import { getHarness } from "@agntn/harnesses";',
    "",
    `// ${props.sample.name}, binary ${props.sample.binaries[0] ?? "none"}`,
    `const harness = getHarness("${props.sample.id}");`,
    'const paths = harness.resolve({ platform: "linux", homeDir: "/home/dev" });',
    `paths.config[0]?.path;    // ${quoted(first("config"))}`,
    `paths.sessions[0]?.path;  // ${quoted(first("sessions"))}`,
    `paths.instructions[0]?.path; // ${quoted(first("instructions"))}`,
    `paths.skills[0]?.path;    // ${quoted(first("skills"))}`,
    `paths.hooks[0]?.path;     // ${quoted(first("hooks"))}`,
    "",
    `harness.detection.envVars; // ${env.length > 0 ? JSON.stringify(env.slice(0, 2)) : "[] project markers only"}`,
  ];
});
</script>

<template>
  <section class="tool-console landing-file" aria-label="One harness as a file">
    <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
    <span class="console-cross console-cross-br" aria-hidden="true">+</span>

    <header class="console-bar">
      <span class="console-title file-name"
        ><span class="console-tag">File</span
        ><Transition name="harnesses-roll" mode="out-in"
          ><span :key="sample.id" class="harnesses-roll-slot">{{ sample.id }}.ts</span></Transition
        ></span
      >
      <span class="console-meta">same calls · {{ HARNESSES.length }} harnesses</span>
      <span class="console-mark" aria-hidden="true" />
    </header>
    <div class="console-ruler" aria-hidden="true">
      <span :key="sample.id" class="console-cursor" />
    </div>

    <div class="file-body">
      <p class="console-label console-rule-title">
        <span>Resolve <span aria-hidden="true">[ templates expanded for linux ]</span></span>
        <span class="console-mark" aria-hidden="true" />
        <UButton
          color="neutral"
          variant="subtle"
          :icon="copied === 'file' ? 'i-lucide-check' : 'i-lucide-copy'"
          :label="copied === 'file' ? 'copied' : 'copy'"
          :aria-label="copied === 'file' ? 'Copied' : 'Copy the file'"
          @click="copy('file', lines.join('\n'))"
        />
      </p>
      <!-- prettier-ignore -->
      <pre class="console-snippet console-lines file-lines"><code><span v-for="(line, index) in lines" :key="index"><span v-for="(token, part) in tokens(line)" :key="part" :class="token.cls">{{ token.text }}</span></span></code></pre>
    </div>

    <footer class="console-footer console-footer-plain">
      <NuxtLink :to="sample.to" class="file-link"
        ><span aria-hidden="true">→ </span>{{ sample.name }}</NuxtLink
      >
      <div class="console-controls" aria-label="Sample harnesses">
        <UButton
          color="neutral"
          variant="subtle"
          square
          icon="i-lucide-chevron-left"
          aria-label="Previous harness"
          @click="emit('step', -1)"
        />
        <span>Harness</span>
        <UButton
          color="neutral"
          variant="subtle"
          square
          icon="i-lucide-chevron-right"
          aria-label="Next harness"
          @click="emit('step', 1)"
        />
      </div>
    </footer>
  </section>
</template>

<style scoped>
.file-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-name :deep(.harnesses-roll-slot) {
  display: inline;
}
.file-body {
  padding: 14px 20px 16px;
}
.file-body > .console-rule-title {
  margin-bottom: 10px;
}
/* One line per code line whatever the harness: long paths end in an ellipsis, copy hands out the whole line. */
.file-lines > code > span {
  overflow: hidden;
  padding-left: calc(2.25em + 1em);
  text-indent: 0;
  text-overflow: ellipsis;
  white-space: pre;
}
.file-lines > code > span::before {
  margin-left: calc(-2.25em - 1em);
}
.file-lines > code > span :deep(*) {
  white-space: pre;
  overflow-wrap: normal;
}
.landing-file > .console-footer {
  flex-wrap: nowrap;
}
.file-link {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-highlighted);
}
.file-link:hover {
  color: var(--console-accent);
}
.file-link:focus-visible {
  outline: 1px solid var(--ui-primary);
  outline-offset: 3px;
}
@media (width < 640px) {
  .file-body > .console-rule-title > .console-mark {
    display: none;
  }
}
@media (width < 400px) {
  .file-body {
    padding-inline: 14px;
  }
  .file-body > .console-rule-title > span:first-child > span {
    display: none;
  }
}
</style>
