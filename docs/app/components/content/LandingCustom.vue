<script setup lang="ts">
import { tokens } from "../../utils/tokens";

const { copied, copy } = useCopied();

/** A harness the registry doesn't ship, written the way the built-ins are. Static: nothing walks here. */
const LINES = [
  'import { Harness, registerHarness, type HarnessId } from "@agntn/harnesses";',
  "",
  "class Aider extends Harness {",
  '  readonly id = "aider" as HarnessId;',
  '  readonly name = "Aider";',
  '  readonly binaries = ["aider"];',
  "  readonly capabilities = {",
  "    mcp: false, vision: true, audio: false,",
  "    video: false, tools: true, streaming: true,",
  "  };",
  "  readonly config = [",
  '    { path: "~/.aider.conf.yml", scope: "user", level: "official" },',
  "  ];",
  "  readonly sessions = [",
  '    { path: ".aider.chat.history.md", scope: "project", level: "official" },',
  "  ];",
  '  readonly persistence = [{ format: "YAML", level: "official" }];',
  "  readonly instructions = [];",
  "  readonly skills = [];",
  "  readonly commands = [];",
  "  readonly hooks = [];",
  '  readonly detection = { envVars: [], projectMarkers: [".aider.conf.yml"] };',
  "  readonly invocation = {",
  '    args: ["--message", "{prompt}", "--yes-always"],',
  '    modelArgs: ["--model", "{model}"],',
  '    level: "inferred",',
  "  };",
  "}",
  "",
  "registerHarness(Aider);",
] as const;

/**
 * What the panel shows: the same file with the fields the section doesn't talk about folded, so it
 * stands about as tall as the text beside it. The copy button still hands out every line.
 */
const SHOWN = [
  LINES[0],
  "",
  "class Aider extends Harness {",
  '  readonly id = "aider" as HarnessId;',
  "  readonly config = [",
  '    { path: "~/.aider.conf.yml", scope: "user", level: "official" },',
  "  ];",
  "  /* name, binaries, capabilities, sessions, detection, … */",
  '  readonly invocation = { /* args, modelArgs */ level: "inferred" };',
  "}",
  "",
  "registerHarness(Aider);",
];

const FILE = LINES.join("\n");
</script>

<template>
  <section class="tool-console landing-custom" aria-label="A custom harness as a file">
    <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
    <span class="console-cross console-cross-br" aria-hidden="true">+</span>

    <header class="console-bar">
      <span class="console-title"><span class="console-tag">File</span>aider.ts</span>
      <UButton
        color="neutral"
        variant="subtle"
        :icon="copied === 'custom' ? 'i-lucide-check' : 'i-lucide-copy'"
        :label="copied === 'custom' ? 'copied' : 'copy'"
        :aria-label="copied === 'custom' ? 'Copied' : 'Copy the whole file'"
        @click="copy('custom', FILE)"
      />
      <span class="console-mark" aria-hidden="true" />
    </header>
    <div class="console-ruler" aria-hidden="true" />

    <div class="custom-body">
      <!-- prettier-ignore -->
      <pre class="console-snippet console-lines custom-lines"><code><span v-for="(line, index) in SHOWN" :key="index"><span v-for="(token, part) in tokens(line)" :key="part" :class="token.cls">{{ token.text }}</span></span></code></pre>
    </div>
  </section>
</template>

<style scoped>
.custom-body {
  padding: 14px 20px 18px;
}
/* Lines break between words only; a path split at its slash is harder to read than a wrapped line. */
.custom-lines {
  margin: 0;
  overflow-wrap: break-word;
}
.custom-lines > code > span :deep(*) {
  overflow-wrap: break-word;
}
@media (width < 400px) {
  .custom-body {
    padding-inline: 14px;
  }
}
</style>
