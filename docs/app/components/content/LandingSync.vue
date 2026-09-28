<script setup lang="ts">
import type { HarnessEntry } from "../../utils/harnesses";
import { HARNESSES } from "../../utils/harnesses";
import { jsonTokens } from "../../utils/tokens";

const props = defineProps<{ sample: HarnessEntry }>();

/** User-scope MCP config files, the targets `syncMcpServers` rewrites. */
const targets = HARNESSES.flatMap((harness) =>
  harness.mcpConfigs
    .filter((file) => file.scope === "user")
    .map((file) => ({ id: harness.id, short: harness.short, icon: harness.icon, ...file })),
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

/** On screen the server's arguments fold into one line, so the panel stands about as tall as its text. Copy hands out MASTER. */
const LINES = [
  "{",
  '  "excludes": ["codex"],',
  '  "mcpServers": {',
  '    "harnesses": { "command": "npx", "args": [/* … */] }',
  "  }",
  "}",
];

const { copied, copy } = useCopied();

const active = computed(() => targets.find((target) => target.id === props.sample.id));
const effect = computed(() => {
  const target = active.value;
  if (!target) return "no user MCP config mapped, sync skips it";
  return target.format === "toml"
    ? "surgical TOML edit, comments kept"
    : `JSON rewritten under ${target.key.join(".")}`;
});
</script>

<template>
  <section class="tool-console landing-sync" aria-label="One MCP list synced into every harness">
    <span class="console-cross console-cross-tl" aria-hidden="true">+</span>
    <span class="console-cross console-cross-br" aria-hidden="true">+</span>

    <header class="console-bar">
      <span class="console-title"
        ><span class="console-tag">File</span>~/.config/agntn/mcp.jsonc</span
      >
      <UButton
        color="neutral"
        variant="subtle"
        :icon="copied === 'master' ? 'i-lucide-check' : 'i-lucide-copy'"
        :label="copied === 'master' ? 'copied' : 'copy'"
        :aria-label="copied === 'master' ? 'Copied' : 'Copy the master list'"
        @click="copy('master', MASTER)"
      />
      <span class="console-mark" aria-hidden="true" />
    </header>
    <div class="console-ruler" aria-hidden="true">
      <span :key="sample.id" class="console-cursor" />
    </div>

    <div class="sync-body">
      <!-- prettier-ignore -->
      <pre class="console-snippet console-lines sync-lines"><code><span v-for="(line, index) in LINES" :key="index"><span v-for="(token, part) in jsonTokens(line)" :key="part" :class="token.cls">{{ token.text }}</span></span></code></pre>

      <p class="console-label console-rule-title sync-rule">
        <span
          >Targets <span aria-hidden="true">[ {{ targets.length }} user configs ]</span></span
        >
        <span class="console-mark" aria-hidden="true" />
      </p>
      <ul class="sync-cells">
        <li
          v-for="target in targets"
          :key="`${target.id}-${target.path}`"
          :class="{ 'sync-on': target.id === sample.id }"
        >
          <UTooltip
            :text="`${target.short}: ${target.path} · ${target.format} · ${target.dialect}`"
          >
            <NuxtLink :to="`/harnesses/${target.id}`" class="sync-cell">
              <UIcon :name="target.icon" class="sync-icon" aria-hidden="true" />
              <span class="sync-name">{{ target.short }}</span>
              <span class="sync-format">{{ target.format }}</span>
            </NuxtLink>
          </UTooltip>
        </li>
      </ul>
    </div>

    <footer class="console-footer console-footer-plain">
      <span class="sync-effect"
        ><span class="sync-effect-name">{{ sample.short }}</span> {{ effect }}</span
      >
    </footer>
  </section>
</template>

<style scoped>
.landing-sync {
  container-type: inline-size;
}
.sync-body {
  padding: 14px 20px 18px;
}
.sync-body > .console-rule-title {
  margin: 0 0 10px;
}
.sync-body > .sync-rule {
  margin-top: 16px;
}
.sync-lines {
  margin: 0;
}
/* One cell per target file; the harness the walk is on gets the accent. */
.sync-cells {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.sync-cell {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 6px 9px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ui-text-muted);
  box-shadow: inset 0 0 0 1px var(--console-line);
  transition:
    color 0.2s ease,
    box-shadow 0.2s ease;
}
.sync-icon {
  width: 13px;
  height: 13px;
  color: var(--ui-text-dimmed);
}
.sync-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sync-format {
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ui-text-dimmed);
}
.sync-cell:hover {
  color: var(--ui-text-highlighted);
}
.sync-cell:focus-visible {
  outline: 1px solid var(--ui-primary);
  outline-offset: 2px;
}
.sync-on .sync-cell {
  color: var(--ui-text-highlighted);
  box-shadow: inset 0 0 0 1px var(--console-accent);
}
.sync-on .sync-icon {
  color: var(--console-accent);
}
.sync-effect {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sync-effect-name {
  color: var(--ui-text-highlighted);
}
/* Beside the text at 1024px the panel is narrow: three cells a row, the format moves to the tooltip. */
@container (width < 30rem) {
  .sync-cells {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .sync-format {
    display: none;
  }
  .sync-cell {
    grid-template-columns: 14px minmax(0, 1fr);
  }
}
@media (width < 400px) {
  .sync-body {
    padding-inline: 14px;
  }
  .sync-body > .console-rule-title > span:first-child > span {
    display: none;
  }
  .sync-cells {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (prefers-reduced-motion: reduce) {
  .sync-cell {
    transition: none;
  }
}
</style>
