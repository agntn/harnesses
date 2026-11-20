import type { HarnessConstructor } from "../harness.ts";
import Antigravity from "./antigravity.ts";
import Claude from "./claude.ts";
import Codex from "./codex.ts";
import Cursor from "./cursor.ts";
import Freebuff from "./freebuff.ts";
import Gemini from "./gemini.ts";
import GitHubCopilot from "./github-copilot.ts";
import Grok from "./grok.ts";
import Hermes from "./hermes.ts";
import Kilo from "./kilo.ts";
import MastraCode from "./mastracode.ts";
import Omp from "./omp.ts";
import OpenBot from "./openbot.ts";
import OpenCode from "./opencode.ts";
import Pi from "./pi.ts";
import PrimeAgent from "./prime-agent.ts";
import Vibe from "./vibe.ts";

/**
 * Env detection walks this list in order, so a fork that keeps its parent's marker goes first,
 * and Hermes and OpenBot, whose markers every CLI they start inherits, go last.
 */
export const harnesses: HarnessConstructor[] = [
  Antigravity,
  Claude,
  Codex,
  Cursor,
  Freebuff,
  Gemini,
  GitHubCopilot,
  Grok,
  Kilo,
  MastraCode,
  Omp,
  OpenCode,
  // Prime Agent is a Pi fork that still exports PI_CODING_AGENT, so its own
  // env marker must be checked before Pi's.
  PrimeAgent,
  Pi,
  Vibe,
  Hermes,
  OpenBot,
];
