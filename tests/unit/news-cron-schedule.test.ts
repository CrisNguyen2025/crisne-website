import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NEWS_CRON_SCHEDULE } from "@/lib/news/cron-schedule";

describe("NEWS_CRON_SCHEDULE", () => {
  it("matches the /api/news/cron schedule in vercel.json", () => {
    const vercelConfig = JSON.parse(
      readFileSync(path.join(process.cwd(), "vercel.json"), "utf8")
    ) as { crons?: { path: string; schedule: string }[] };
    const newsCron = vercelConfig.crons?.find((cron) => cron.path === "/api/news/cron");
    expect(newsCron?.schedule).toBe(NEWS_CRON_SCHEDULE.cron);
  });
});
