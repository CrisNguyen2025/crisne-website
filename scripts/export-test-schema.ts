import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const rootDir = path.resolve(__dirname, "..");
const schemaPrisma = path.join(rootDir, "prisma", "schema.prisma");
const targetSql = path.join(
  rootDir,
  "roadmap-rag-assistant",
  "tests",
  "fixtures",
  "schema.sql"
);

export function generateSchemaSql(): string {
  const cmd = `npx prisma migrate diff --from-empty --to-schema-datamodel "${schemaPrisma}" --script`;
  return execSync(cmd, { cwd: rootDir, encoding: "utf8" });
}

function main() {
  const isCheck = process.argv.includes("--check");
  const ddl = generateSchemaSql();

  if (isCheck) {
    if (!fs.existsSync(targetSql)) {
      console.error(`Missing schema fixture at ${targetSql}`);
      process.exit(1);
    }
    const current = fs.readFileSync(targetSql, "utf8");
    if (current.trim() !== ddl.trim()) {
      console.error(
        "Schema fixture out of date. Run `yarn test:schema-sql` to update."
      );
      process.exit(1);
    }
    console.log("Schema fixture is up to date.");
    return;
  }

  fs.mkdirSync(path.dirname(targetSql), { recursive: true });
  fs.writeFileSync(targetSql, ddl, "utf8");
  console.log(`Exported test schema to ${targetSql}`);
}

if (require.main === module) {
  main();
}
