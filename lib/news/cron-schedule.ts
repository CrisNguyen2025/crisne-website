/**
 * Mirror of the `/api/news/cron` entry in `vercel.json` (Vercel Cron always runs in UTC).
 * The UI cannot read `vercel.json`, so keep both in sync; a unit test guards the cron string.
 * Runs hourly; each run pulls only the sources whose own hour and interval are due.
 */
export const NEWS_CRON_SCHEDULE = {
  cron: "0 * * * *",
  label: "theo giờ và tần suất của từng nguồn (giờ VN)",
} as const;
