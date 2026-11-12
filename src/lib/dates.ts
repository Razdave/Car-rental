/** Local-time helpers. All booking dates are `YYYY-MM-DD`, times are `hh:mm AM|PM` (matches the API). */

export const TIME_OPTIONS = Array.from({ length: 24 }, (_, hour) => {
  const period = hour < 12 ? 'AM' : 'PM';
  const hour12 = hour % 12 || 12;
  return `${String(hour12).padStart(2, '0')}:00 ${period}`;
});

export const toISODate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const todayISO = (): string => toISODate(new Date());

export const addDays = (iso: string, days: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return toISODate(new Date(y, m - 1, d + days));
};

const parseISO = (iso: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

/** "Thu, 14 Nov" */
export const formatDate = (iso: string): string => {
  const date = parseISO(iso);
  if (!date) return iso;
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

/** "14 – 17 Nov" or "28 Nov – 2 Dec" */
export const formatDateRange = (start: string, end: string): string => {
  const a = parseISO(start);
  const b = parseISO(end);
  if (!a || !b) return `${start} – ${end}`;
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  const left = sameMonth
    ? String(a.getDate())
    : a.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const right = b.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return start === end ? right : `${left} – ${right}`;
};

/** Minutes since epoch (UTC-based, used only for differences). */
export const getDateTimeMinutes = (date: string, time: string): number | null => {
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeParts = /^(\d{2}):(\d{2}) (AM|PM)$/.exec(time);
  if (!dateParts || !timeParts) return null;
  const [, year, month, day] = dateParts;
  const [, hourText, minuteText, period] = timeParts;
  const hour = (Number(hourText) % 12) + (period === 'PM' ? 12 : 0);
  return Date.UTC(Number(year), Number(month) - 1, Number(day), hour, Number(minuteText)) / 60000;
};

/** Adds whole hours to a date + 12h time pair. */
export const addHours = (date: string, time: string, hours: number): { date: string; time: string } => {
  const minutes = getDateTimeMinutes(date, time);
  if (minutes === null) return { date, time };
  const next = new Date((minutes + hours * 60) * 60000);
  const h = next.getUTCHours();
  return {
    date: next.toISOString().slice(0, 10),
    time: `${String(h % 12 || 12).padStart(2, '0')}:${String(next.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
  };
};

/** Next whole hour from now, in the 12h format, plus the date it falls on. */
export const nextHourSlot = (): { date: string; time: string } => {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  const h = now.getHours();
  return {
    date: toISODate(now),
    time: `${String(h % 12 || 12).padStart(2, '0')}:00 ${h < 12 ? 'AM' : 'PM'}`
  };
};
