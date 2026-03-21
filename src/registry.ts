import { Client } from "./client.ts";
import { definitions } from "./clients/index.ts";
import type { ClientDefinition, ClientId } from "./types.ts";

let registry: Map<ClientId, Client> | undefined;

function getRegistry(): Map<ClientId, Client> {
  if (!registry) {
    registry = new Map();
    for (const def of definitions) {
      registry.set(def.id, new Client(def));
    }
  }
  return registry;
}

export function defineClient(definition: ClientDefinition): Client {
  const client = new Client(definition);
  getRegistry().set(definition.id, client);
  return client;
}

export function getClient(id: ClientId): Client {
  const client = getRegistry().get(id);
  if (!client) throw new Error(`Unknown client: ${id}`);
  return client;
}

export function listClients(): ClientId[] {
  return [...getRegistry().keys()];
}

export function getAllClients(): Client[] {
  return [...getRegistry().values()];
}

/**
 * Detect the active agent from environment variables.
 * Returns the first match since env detection is unambiguous.
 */
export function detectClientFromEnv(): Client | null {
  for (const client of getRegistry().values()) {
    if (client.detectEnv()) return client;
  }
  return null;
}

/**
 * Detect which agents have project-level markers in the given directory.
 * Returns all matches (multiple agents can be configured in the same project).
 */
export function detectProjectClients(cwd?: string): Client[] {
  return [...getRegistry().values()].filter((client) => client.detectProject(cwd));
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
  for (const client of getRegistry().values()) {
    if (client.detectProject(cwd)) {
      if (match) return null;
      match = client;
    }
  }
  return match;
}
