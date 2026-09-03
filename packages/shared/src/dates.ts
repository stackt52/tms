/** Date helpers. All persisted timestamps are ISO-8601 strings (UTC); Zambia is UTC+2 year-round. */

export const ZAMBIA_TZ_OFFSET_HOURS = 2;

/** Zambian public holidays (fixed-date ones); configurable via policy config in production. */
export const DEFAULT_PUBLIC_HOLIDAYS_MMDD = [
  '01-01', // New Year's Day
  '03-08', // International Women's Day
  '03-12', // Youth Day
  '05-01', // Labour Day
  '05-25', // Africa Freedom Day
  '07-07', // Heroes' Day (approx; first Monday of July in practice)
  '07-08', // Unity Day (approx)
  '08-04', // Farmers' Day (approx; first Monday of August)
  '10-18', // National Day of Prayer
  '10-24', // Independence Day
  '12-25', // Christmas Day
];

export function toDate(d: string | Date): Date {
  return d instanceof Date ? d : new Date(d);
}

export function startOfDay(d: string | Date): Date {
  const x = toDate(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
}

export function addDays(d: string | Date, days: number): Date {
  const x = new Date(toDate(d).getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

export function hoursBetween(a: string | Date, b: string | Date): number {
  return (toDate(b).getTime() - toDate(a).getTime()) / 36e5;
}

/** Calendar days between two instants, based on calendar dates (not 24h blocks). */
export function calendarDaysBetween(a: string | Date, b: string | Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 864e5);
}

/** Nights away = number of calendar-date boundaries crossed between departure and return. */
export function nightsBetween(departAt: string | Date, returnAt: string | Date): number {
  return Math.max(0, calendarDaysBetween(departAt, returnAt));
}

export function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

export function isPublicHoliday(d: Date, holidays: readonly string[] = DEFAULT_PUBLIC_HOLIDAYS_MMDD): boolean {
  const mmdd = `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return holidays.includes(mmdd);
}

/**
 * Working days strictly between `from` (exclusive) and `to` (exclusive of the `to` date itself),
 * i.e. how many full business days a Finance team has to act before departure.
 */
export function workingDaysBetween(from: string | Date, to: string | Date, holidays?: readonly string[]): number {
  let cursor = addDays(startOfDay(from), 1);
  const end = startOfDay(to);
  let count = 0;
  while (cursor.getTime() < end.getTime()) {
    if (!isWeekend(cursor) && !isPublicHoliday(cursor, holidays)) count++;
    cursor = addDays(cursor, 1);
  }
  return count;
}

export function isoDate(d: string | Date): string {
  return toDate(d).toISOString().slice(0, 10);
}

export function yearOf(d: string | Date = new Date()): number {
  return toDate(d).getUTCFullYear();
}
