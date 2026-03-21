import type { ClientDefinition } from "../types.ts";
import claude from "./claude.ts";
import codex from "./codex.ts";
import cursor from "./cursor.ts";
import gemini from "./gemini.ts";
import githubCopilot from "./github-copilot.ts";
import mastracode from "./mastracode.ts";
import opencode from "./opencode.ts";

export const definitions: ClientDefinition[] = [
  claude,
  codex,
  cursor,
  gemini,
  githubCopilot,
  mastracode,
  opencode,
];
