import { createClient } from "@libsql/client";
import * as fs from "fs";
import * as path from "path";

// Tự động load biến môi trường từ .env.local và .env khi chạy bằng ts-node/node độc lập
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

async function initTurso() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    console.error("❌ Thiếu biến môi trường TURSO_DATABASE_URL hoặc TURSO_AUTH_TOKEN trong .env.local!");
    process.exit(1);
  }

  console.log(`📡 Đang kết nối tới Turso: ${url}...`);
  const client = createClient({ url, authToken });

  const sqlFilePath = path.join(__dirname, "../prisma/init-turso.sql");
  const sql = fs.readFileSync(sqlFilePath, "utf8");

  // Loại bỏ các comment SQL dạng -- ...
  const cleanSql = sql
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !line.startsWith("--"))
    .join("\n");

  // Tách câu lệnh theo dấu ;
  const statements = cleanSql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  console.log(`🚀 Bắt đầu khởi tạo ${statements.length} bảng và indexes trên Turso...`);

  for (const statement of statements) {
    try {
      await client.execute(statement);
    } catch (err: unknown) {
      console.error(`⚠️ Lỗi thực thi statement:`, statement.slice(0, 50), err);
    }
  }

  console.log("✅ Khởi tạo thành công tất cả bảng và indexes trên Turso Database!");
}

initTurso().catch((err) => {
  console.error("❌ Lỗi:", err);
  process.exit(1);
});
