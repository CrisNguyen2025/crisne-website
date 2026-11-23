/**
 * Mirror of the `/api/news/cron` entry in `vercel.json` (Vercel Cron always runs in UTC).
 * The UI cannot read `vercel.json`, so keep both in sync; a unit test guards the cron string.
 */
export const NEWS_CRON_SCHEDULE = {
  cron: "0 4 * * *",
  label: "11:00 hằng ngày (giờ VN)",
} as const;
