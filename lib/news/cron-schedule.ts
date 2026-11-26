/**
 * Mirror of the `/api/news/cron` entry in `vercel.json` (Vercel Cron always runs in UTC).
 * The UI cannot read `vercel.json`, so keep both in sync; a unit test guards the cron string.
 * Runs once a day at 00:00 UTC = 07:00 Vietnam time (the Hobby plan allows only daily cron jobs
 * and may fire anywhere within that hour); each run pulls only the sources whose interval is due.
 */
export const NEWS_CRON_SCHEDULE = {
  cron: "0 0 * * *",
  label: "07:00 hằng ngày (giờ VN), theo tần suất của từng nguồn",
} as const;
