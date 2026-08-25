import type { ClientConstructor } from "../client.ts";
import Claude from "./claude.ts";
import Codex from "./codex.ts";
import Cursor from "./cursor.ts";
import Gemini from "./gemini.ts";
import GitHubCopilot from "./github-copilot.ts";
import MastraCode from "./mastracode.ts";
import OpenCode from "./opencode.ts";

export const clients: ClientConstructor[] = [
  Claude,
  Codex,
  Cursor,
  Gemini,
  GitHubCopilot,
  MastraCode,
  OpenCode,
];
