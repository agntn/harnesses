# Design system

The shared rules (direction, color roles, type, the `console-*` grammar, hero, docs chrome, density, motion, checks) live in the one agntn design system document, kept with the agntn skills until it ships in the shared package. This file records only what harnesses owns and where it departs from the shared rules. It does not repeat them.

The instruments harnesses owns:

| Instrument | Where | Object |
| --- | --- | --- |
| [LandingHero.vue](app/components/content/LandingHero.vue) | landing, first screen | hero zone, circuit `getHarness(id)` into the map |
| [LandingMap.vue](app/components/content/LandingMap.vue) | under the hero | one harness as a map: every path group with its first path and evidence, walked across the samples |
| [LandingRotatingCode.vue](app/components/content/LandingRotatingCode.vue) | "Every path, with its evidence" | the same twelve lines for every sample, as a file |
| [LandingModes.vue](app/components/content/LandingModes.vue) | "Six modes, none of them a fallback" | the six invocation modes, the line one of them spawns, the error another one throws |
| [LandingSync.vue](app/components/content/LandingSync.vue) | "One list, every dialect" | `mcp.jsonc` and the user configs sync rewrites |
| [LandingRegistry.vue](app/components/content/LandingRegistry.vue) | "Thirteen harnesses, three platforms" | every harness as a cell |
| [LandingToolCall.vue](app/components/content/LandingToolCall.vue) | "Eleven tools, three hosts" | `harnesses_info` arguments and the fields its answer carries |
| [LandingCustom.vue](app/components/content/LandingCustom.vue) | "Extend Harness, call registerHarness" | a custom harness as a file |
| [LandingStart.vue](app/components/content/LandingStart.vue) | closing section | install, notes, first lookup as a file |
| [HarnessFacts.vue](app/components/content/HarnessFacts.vue) | every harness page | harness dossier: ID bar with position, reticle, binaries, readout with the evidence gauge, access leads |
| [HarnessSheet.vue](app/components/content/HarnessSheet.vue) | every harness page, under the prose | invocation templates, paths, env overrides, MCP files and detection, one [ConsolePanel](app/components/ConsolePanel.vue) each |
| [HarnessRoster.vue](app/components/content/HarnessRoster.vue) | `/harnesses` | roster of the harnesses on `UTable`, sortable |
| [HarnessesExplorer.vue](app/components/content/HarnessesExplorer.vue) | `/explorer` | request, resolved paths, invocation and detection as four instruments |
| [Landing.takumi.vue](app/components/OgImage/Landing.takumi.vue), [Docs.takumi.vue](app/components/OgImage/Docs.takumi.vue) | OG images | the hero zone in 1200 by 600; a docs page as one instrument with the section tag, ruler and four of the agent tools |

Harness names, icons and blurbs come from `PRESENTATION` in [harnesses.ts](app/utils/harnesses.ts); every count, path, template and marker comes from `#harnesses-registry`, which the build copies out of the library.

## Nuxt UI variants

Controls are Nuxt UI components; `app.config.ts` gives each variant its family look with classes from `app.css`, the same mapping as explorers and registries.

| Component and variant | Look | Used for |
| --- | --- | --- |
| `UButton` primary solid | amber action segment, glyph in its own cell | get started, read the guide |
| `UButton` neutral outline | quiet action segment | GitHub, open the explorer |
| `UButton` neutral subtle | boxed control, `square` for a step | copy, previous and next |
| `UButton` variant `chip`, neutral or primary | chip, the picked one on the accent edge | platform and harness in the explorer |
| `UBadge` neutral subtle, neutral outline | boxed mono word: bright, quiet | capabilities on a harness page, `yes` bright and `no` quiet |
| `UInput` none | the readout row is the frame, the value mono | homeDir, projectRoot, model, prompt |
| `USelectMenu` none | the same, with the menu in the tooltip's grammar | invocation mode |

## Anatomy

- **Map.** Bar `Call getHarness("<id>").resolve(…)` with the whole call in a tooltip, the position `03 / 13`, meta the platform and the path count. Subject band: reticle with the harness glyph, `Harness / <id>`, name, blurb on one line. Under the identity, `Map [ ~ and . on linux ]`: one row per path group, always all eight, so the map keeps one height. A row is the field name, the first path the group resolves to (the rest in a tooltip with scope and level), a leader, `+n` more, and a node: hatched when every path is checked, an accent outline when one is inferred, empty when the group has none. The readout stretches to the map's height: binary, invoke modes in the accent, model listing, MCP dialect, agents file, then the gauge with one tick per path, inferred ones open.
- **Modes.** Six cells, the state on the node (accent outline where the harness has a recipe). Under them `Spawned` with the first supported mode's command line and `Rejected` with the library's error for the first unsupported one; a harness with no headless mode or no rejected mode prints a quiet line of the same shape, so the height never changes.
- **Sync.** The master list as a file, its server folded to one line on screen and copied whole, then one cell per user-scope MCP config; the harness the walk is on gets the accent. The footer says what sync does to that file.
- **Harness dossier.** ID bar with the id and `02 / 13`, meta the path count and the detection kind. Subject band: reticle, name, binaries as boxed identifiers, blurb. Readout: invoke (modes and evidence level, accent), models, MCP, agents file, the evidence gauge. `Access` leads: `Get`, `CLI`, `Try` into the explorer.
- **Harness sheet.** The prose headings stay `ProseH2` so the table of contents reads them; every table under them is a `ConsolePanel` with a tagged bar (`Call invoke(prompt, options)`, `Paths getHarness("<id>")`, `Env envOverrides`, `File mcpConfigs`, `Call detectHarness()`). Path rows carry scope, level and platform as boxed words; an inferred level is the one in the accent.
- **Roster.** `getAllHarnesses()` in the bar, alphabetical until a header is clicked. Columns: harness with its id boxed under the name, detection, the headless mode families, the session formats, and at the end of a dotted leader `n of m inferred`, the count in the accent when it isn't zero.
- **Explorer.** The request instrument carries the reticle, a readout with the harness, the platform chips and the two roots as fields, and a chip per harness. Paths, invocation and detection follow as panels. Every state is in the query.

## Motion

| Change | Motion |
| --- | --- |
| landing sample advances (4.2 s, paused on hover and focus) | ruler cursor once, scan and reticle arcs on the map and the tool call, map rows slide in, gauge ticks grow, file name rolls, the hero circuit runs once |
| explorer changes harness or platform | ruler cursor once on the request and the paths |
| reduced motion | no walk; previous and next still work |

## Differences

Departures from the shared rules, recorded for the shared package:

- The tool call has no `03 Full tool response` row. `harnesses_info` answers in TOON through `@toon-format/toon`, and the site must not import npm code into the registry subgraph (Workers Builds installs `docs/` only), so it cannot print the real text. The readout shows the fields the answer carries instead.
- The landing instruments walk the registry itself, not recorded samples: nothing is fetched, so there is no `recorded` or `live` in the meta.
- The sync and aider files fold what their section doesn't talk about on screen and hand out the whole file on copy, so they stand about as tall as the text beside them.
- Beside the text at 1024 px the sync and registry cells shed their second detail (format, id) through a container query instead of dropping to two columns.
- Harness glyphs are `simple-icons` for the vendors that have one and Lucide for the rest (Freebuff, Mastra Code, OMP, OpenCode, Pi, Prime Agent): coding agents have no monochrome set of their own.
- The share bar under the hero metrics splits checked paths (official and community) from inferred ones. The inferred side is small; that is the data, not a styling choice.
- The version comes from the library's `version` export; no data version exists, so ID strips and footers carry none.
- The OG images ship local Figtree and Fira Code TTFs, the keys mechanism.

## Checks

Beyond the shared checks: the landing at 1440, 1024, 390 and 320 px with the heights of the seven landing instruments through all thirteen samples, `/explorer?id=codex&platform=win32&mode=readOnly`, the rejected `/explorer?id=github-copilot&mode=advisorStructured` (its bar titles once stretched every panel to 511 px at 390), `/harnesses` and one harness page.
