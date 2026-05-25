// Test Notion Favorites API
import { Client } from "@notionhq/client";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

const FAVORITES_DB_ID = process.env.NOTION_FAVORITES_DB_ID;

console.log("Testing Notion Favorites...");
console.log("Database ID:", FAVORITES_DB_ID);

try {
  // Get database info
  const db = await notion.databases.retrieve({ database_id: FAVORITES_DB_ID });
  console.log("\n✅ Database found:", db.title[0]?.plain_text || "Untitled");
  
  // Get data sources
  const dataSources = db.data_sources || [];
  console.log("Data sources:", dataSources.length);
  
  if (dataSources.length === 0) {
    console.log("❌ No data sources found!");
    process.exit(1);
  }
  
  const dataSourceId = dataSources[0].id;
  console.log("Using data source:", dataSourceId);
  
  // Query all pages
  const response = await notion.dataSources.query({
    data_source_id: dataSourceId,
    page_size: 100,
  });
  
  console.log("\n📊 Total pages:", response.results.length);
  
  response.results.forEach((page, i) => {
    if (page.object !== "page") return;
    
    const props = page.properties;
    const userId = props.UserId?.title?.[0]?.plain_text || "";
    const tagId = props.TagId?.rich_text?.[0]?.plain_text || "";
    
    console.log(`\n${i + 1}. UserId: "${userId}"`);
    console.log(`   TagId: "${tagId}"`);
  });
  
} catch (err) {
  console.error("❌ Error:", err.message);
  if (err.code) console.error("Code:", err.code);
  process.exit(1);
}
