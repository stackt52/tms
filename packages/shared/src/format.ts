/** Presentation helpers shared by API responses (e.g. notifications) and the web app. */

export function formatZMW(amount: number, opts: { compact?: boolean; decimals?: number } = {}): string {
  if (opts.compact && Math.abs(amount) >= 1000) {
    return `ZMW ${Math.round(amount / 1000)}k`;
  }
  const decimals = opts.decimals ?? 2;
  return `ZMW ${amount.toLocaleString('en-ZM', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

export function formatAmount(amount: number, decimals = 2): string {
  return amount.toLocaleString('en-ZM', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Zambia (CAT, UTC+2) has no DST — shift once and format with UTC getters so output is stable on every host. */
function cat(d: string | Date): Date {
  const x = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T00:00:00Z`) : new Date(d);
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? x : new Date(x.getTime() + 2 * 3600 * 1000);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 08 Sep */
export function fmtDay(d: string | Date): string {
  const x = cat(d);
  return `${pad(x.getUTCDate())} ${MONTHS[x.getUTCMonth()]}`;
}
/** 08 Sep 2026 */
export function fmtDate(d: string | Date): string {
  const x = cat(d);
  return `${pad(x.getUTCDate())} ${MONTHS[x.getUTCMonth()]} ${x.getUTCFullYear()}`;
}
/** Mon 08 Sep */
export function fmtDowDay(d: string | Date): string {
  const x = cat(d);
  return `${DAYS[x.getUTCDay()]} ${pad(x.getUTCDate())} ${MONTHS[x.getUTCMonth()]}`;
}
/** Wednesday 03 September */
export function fmtLongDay(d: string | Date): string {
  const x = cat(d);
  return `${DAYS_LONG[x.getUTCDay()]} ${pad(x.getUTCDate())} ${MONTHS_LONG[x.getUTCMonth()]}`;
}
/** 06:30 */
export function fmtTime(d: string | Date): string {
  const x = cat(d);
  return `${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`;
}
/** Mon 08 Sep · 06:30 */
export function fmtDateTime(d: string | Date): string {
  return `${fmtDowDay(d)} · ${fmtTime(d)}`;
}
/** Mon 08 – Thu 11 Sep */
export function fmtRange(a: string | Date, b: string | Date): string {
  const x = cat(a);
  const y = cat(b);
  const sameMonth = x.getUTCMonth() === y.getUTCMonth() && x.getUTCFullYear() === y.getUTCFullYear();
  if (sameMonth) return `${DAYS[x.getUTCDay()]} ${pad(x.getUTCDate())} – ${DAYS[y.getUTCDay()]} ${pad(y.getUTCDate())} ${MONTHS[y.getUTCMonth()]}`;
  return `${fmtDowDay(a)} – ${fmtDowDay(b)}`;
}
/** 02 Sep 09:14 */
export function fmtStamp(d: string | Date): string {
  return `${fmtDay(d)} ${fmtTime(d)}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
