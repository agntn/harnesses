import { writeSync } from "node:fs";
import { registerHooks } from "node:module";

/**
 * Every module URL Node loaded after this file, reported as one `@loaded [...]` line on stderr at exit.
 * Written synchronously, because a piped stderr flushes asynchronously and the exit handler cannot wait.
 */
const loaded: string[] = [];

registerHooks({
  load(url, context, nextLoad) {
    loaded.push(url);
    return nextLoad(url, context);
  },
});

/** A full pipe takes only part of the report, so the rest goes out until every byte is written. */
process.on("exit", () => {
  const report = Buffer.from(`\n@loaded ${JSON.stringify(loaded)}\n`);
  for (let offset = 0; offset < report.length;) {
    try {
      offset += writeSync(2, report, offset);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EAGAIN") throw error;
    }
  }
});
