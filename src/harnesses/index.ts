import type { HarnessConstructor } from "../harness.ts";
import Claude from "./claude.ts";
import Codex from "./codex.ts";
import Cursor from "./cursor.ts";
import Freebuff from "./freebuff.ts";
import Gemini from "./gemini.ts";
import GitHubCopilot from "./github-copilot.ts";
import Grok from "./grok.ts";
import MastraCode from "./mastracode.ts";
import Omp from "./omp.ts";
import OpenCode from "./opencode.ts";
import Pi from "./pi.ts";

export const harnesses: HarnessConstructor[] = [
  Claude,
  Codex,
  Cursor,
  Freebuff,
  Gemini,
  GitHubCopilot,
  Grok,
  MastraCode,
  Omp,
  OpenCode,
  Pi,
];
