import { createClient } from "@libsql/client";
import { v7 as uuidv7 } from "uuid";
import * as fs from "fs";
import * as path from "path";

// Load environment variables from .env.local and .env
function loadEnv() {
  const envFiles = [".env.local", ".env"];
  for (const file of envFiles) {
    const fullPath = path.join(__dirname, "..", file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

loadEnv();

async function migrateToUuidV7() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    console.error("❌ Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in environment!");
    process.exit(1);
  }

  console.log(`📡 Connecting to Turso database: ${url}...`);
  const client = createClient({ url, authToken });

  // Disable foreign keys temporarily during migration
  await client.execute("PRAGMA foreign_keys = OFF;");

  console.log("🚀 Starting UUIDv7 migration for existing records...");

  // 1. Migrate Roadmap
  const roadmapsResult = await client.execute("SELECT id, slug FROM Roadmap;");
  const roadmapMap = new Map<string, string>();
  for (const row of roadmapsResult.rows) {
    const oldId = String(row.id);
    const newId = uuidv7();
    roadmapMap.set(oldId, newId);
    await client.execute({
      sql: "UPDATE Roadmap SET id = ? WHERE id = ?;",
      args: [newId, oldId],
    });
  }
  console.log(`✅ Migrated ${roadmapMap.size} Roadmaps`);

  // 2. Migrate RoadmapLayer (update id and roadmapId foreign key)
  const layersResult = await client.execute("SELECT id, roadmapId FROM RoadmapLayer;");
  const layerMap = new Map<string, string>();
  for (const row of layersResult.rows) {
    const oldId = String(row.id);
    const oldRoadmapId = String(row.roadmapId);
    const newId = uuidv7();
    const newRoadmapId = roadmapMap.get(oldRoadmapId) || oldRoadmapId;
    layerMap.set(oldId, newId);
    await client.execute({
      sql: "UPDATE RoadmapLayer SET id = ?, roadmapId = ? WHERE id = ?;",
      args: [newId, newRoadmapId, oldId],
    });
  }
  console.log(`✅ Migrated ${layerMap.size} RoadmapLayers`);

  // 3. Migrate RoadmapGroup (update id and layerId foreign key)
  const groupsResult = await client.execute("SELECT id, layerId FROM RoadmapGroup;");
  const groupMap = new Map<string, string>();
  for (const row of groupsResult.rows) {
    const oldId = String(row.id);
    const oldLayerId = String(row.layerId);
    const newId = uuidv7();
    const newLayerId = layerMap.get(oldLayerId) || oldLayerId;
    groupMap.set(oldId, newId);
    await client.execute({
      sql: "UPDATE RoadmapGroup SET id = ?, layerId = ? WHERE id = ?;",
      args: [newId, newLayerId, oldId],
    });
  }
  console.log(`✅ Migrated ${groupMap.size} RoadmapGroups`);

  // 4. Migrate RoadmapItem (update id and groupId foreign key)
  const itemsResult = await client.execute("SELECT id, groupId FROM RoadmapItem;");
  let itemsCount = 0;
  for (const row of itemsResult.rows) {
    const oldId = String(row.id);
    const oldGroupId = String(row.groupId);
    const newId = uuidv7();
    const newGroupId = groupMap.get(oldGroupId) || oldGroupId;
    await client.execute({
      sql: "UPDATE RoadmapItem SET id = ?, groupId = ? WHERE id = ?;",
      args: [newId, newGroupId, oldId],
    });
    itemsCount++;
  }
  console.log(`✅ Migrated ${itemsCount} RoadmapItems`);

  // 5. Migrate Tag if any
  const tagsResult = await client.execute("SELECT id FROM Tag;");
  const tagMap = new Map<string, string>();
  for (const row of tagsResult.rows) {
    const oldId = String(row.id);
    const newId = uuidv7();
    tagMap.set(oldId, newId);
    await client.execute({
      sql: "UPDATE Tag SET id = ? WHERE id = ?;",
      args: [newId, oldId],
    });
  }
  console.log(`✅ Migrated ${tagMap.size} Tags`);

  // 6. Migrate Notes (update tagId if any)
  const notesResult = await client.execute("SELECT id, tagId FROM Note;");
  for (const row of notesResult.rows) {
    const oldId = String(row.id);
    const oldTagId = row.tagId ? String(row.tagId) : null;
    const newId = uuidv7();
    const newTagId = oldTagId ? (tagMap.get(oldTagId) || oldTagId) : null;
    await client.execute({
      sql: "UPDATE Note SET id = ?, tagId = ? WHERE id = ?;",
      args: [newId, newTagId, oldId],
    });
  }
  console.log(`✅ Migrated ${notesResult.rows.length} Notes`);

  // Re-enable foreign keys
  await client.execute("PRAGMA foreign_keys = ON;");

  console.log("🎉 Complete! All existing records and relations are now using UUIDv7!");
}

migrateToUuidV7().catch((err) => {
  console.error("❌ Migration error:", err);
  process.exit(1);
});
