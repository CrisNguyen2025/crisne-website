import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/vi';

dayjs.extend(relativeTime);
dayjs.locale('vi');

export function formatFriendlyTime(dateString?: string): string {
  if (!dateString) return '';
  return dayjs(dateString).fromNow();
}

export { dayjs };
