import * as path from "path";
import { adapters } from "./adapters";
import { loadConfig } from "./core/load";
import { sync } from "./core/sync";
import { writeConfig } from "./core/write";

function printCheckOutcome(result: ReturnType<typeof writeConfig>): never {
  const drifted = [...result.created, ...result.changed, ...result.removed];
  if (drifted.length === 0) {
    process.stdout.write("✅ Agent config is up to date.\n");
    process.exit(0);
  }

  process.stderr.write("❌ Agent config is not up to date:\n");
  const groups: Array<[string, string[]]> = [
    ["missing", result.created],
    ["outdated", result.changed],
    ["stale", result.removed],
  ];
  for (const [label, files] of groups) {
    for (const f of files) {
      process.stderr.write(`  - ${label}: ${f}\n`);
    }
  }
  process.stderr.write("Run `yarn agents:sync` to update.\n");
  process.exit(1);
}

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
      printCheckOutcome(result);
    }

    process.stdout.write(
      `✅ Synced agent configs: ${result.created.length} created, ${result.changed.length} updated, ${result.unchanged.length} unchanged, ${result.removed.length} removed.\n`
    );
    process.exit(0);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`❌ Error: ${msg}\n`);
    process.exit(2);
  }
}

if (require.main === module) {
  runCli();
}
