import { Client } from "./client.ts";
import type { ClientDefinition, ClientId } from "./types.ts";

const registry = new Map<ClientId, Client>();

export function defineClient(definition: ClientDefinition): Client {
  const client = new Client(definition);
  registry.set(definition.id, client);
  return client;
}

export function getClient(id: ClientId): Client {
  const client = registry.get(id);
  if (!client) throw new Error(`Unknown client: ${id}`);
  return client;
}

export function listClients(): ClientId[] {
  return [...registry.keys()];
}

export function getAllClients(): Client[] {
  return [...registry.values()];
}

/**
 * Detect the active agent from environment variables.
 * Returns the first match since env detection is unambiguous.
 */
export function detectClientFromEnv(): Client | null {
  for (const client of registry.values()) {
    if (client.detectEnv()) return client;
  }
  return null;
}

/**
 * Detect which agents have project-level markers in the given directory.
 * Returns all matches (multiple agents can be configured in the same project).
 */
export function detectProjectClients(cwd?: string): Client[] {
  return [...registry.values()].filter((client) => client.detectProject(cwd));
}

/**
 * Detect the most likely active agent. Priority:
 * 1. Env vars (running inside agent = unambiguous)
 * 2. Single project-level match
 * 3. null if ambiguous or no match
 */
export function detectClient(cwd?: string): Client | null {
  const fromEnv = detectClientFromEnv();
  if (fromEnv) return fromEnv;

  let match: Client | null = null;
  for (const client of registry.values()) {
    if (client.detectProject(cwd)) {
      if (match) return null;
      match = client;
    }
  }
  return match;
}
