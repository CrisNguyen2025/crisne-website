import * as path from "path";
import { adapters } from "./adapters";
import { loadConfig } from "./core/load";
import { sync } from "./core/sync";
import { writeConfig } from "./core/write";

export function runCli(args: string[] = process.argv.slice(2)): void {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const isCheck = args.includes("--check");

  try {
    const config = loadConfig(repoRoot);
    const { outputs, notes } = sync(config, adapters);

    for (const note of notes) {
      process.stdout.write(`${note}\n`);
    }

    const result = writeConfig(repoRoot, outputs, adapters, { check: isCheck });

    if (isCheck) {
      const drifted = [...result.created, ...result.changed, ...result.removed];
      if (drifted.length > 0) {
        process.stderr.write("❌ Agent config is not up to date:\n");
        for (const f of result.created) {
          process.stderr.write(`  - missing: ${f}\n`);
        }
        for (const f of result.changed) {
          process.stderr.write(`  - outdated: ${f}\n`);
        }
        for (const f of result.removed) {
          process.stderr.write(`  - stale: ${f}\n`);
        }
        process.stderr.write("Run `yarn agents:sync` to update.\n");
        process.exit(1);
      }

      process.stdout.write("✅ Agent config is up to date.\n");
      process.exit(0);
    } else {
      process.stdout.write(
        `✅ Synced agent configs: ${result.created.length} created, ${result.changed.length} updated, ${result.unchanged.length} unchanged, ${result.removed.length} removed.\n`
      );
      process.exit(0);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`❌ Error: ${msg}\n`);
    process.exit(2);
  }
}

if (require.main === module) {
  runCli();
}
