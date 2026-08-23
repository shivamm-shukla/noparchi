import i18n from '../i18n';

/**
 * Dates, times and money, in the language the app is currently showing.
 *
 * These read the active language from i18next rather than taking a locale
 * argument. Threading one through every call site would mean every component
 * that prints a timestamp has to remember to - and the ones that forgot were
 * exactly how "22m ago" survived in the middle of an otherwise Hindi screen.
 *
 * Both locales are -IN: a Hindi reader in India still wants ₹, lakh grouping
 * and a 12-hour clock. The language changes the words, not the conventions.
 */
function locale(): string {
  return i18n.language === 'hi' ? 'hi-IN' : 'en-IN';
}

/**
 * Every formatter falls back to something readable rather than throwing.
 *
 * Intl is complete in browsers and in Hermes on current React Native, but a
 * timestamp is not worth a red screen if it ever is not - a gatekeeper can work
 * from a raw ISO string, not from a crash.
 */
function safely<T>(compute: () => T, fallback: T): T {
  try {
    return compute();
  } catch {
    return fallback;
  }
}

export function formatCurrency(amount: number, currency = 'INR'): string {
  return safely(
    () =>
      new Intl.NumberFormat(locale(), {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      }).format(amount),
    `${currency === 'INR' ? '₹' : `${currency} `}${amount}`
  );
}

/** "23 Aug, 12:51 pm" - date and time together, for a row that needs both. */
export function formatDateTime(isoString: string): string {
  return safely(
    () =>
      new Date(isoString).toLocaleString(locale(), {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
    isoString
  );
}

/** Just the clock. What a gatekeeper needs when a pass was already cleared. */
export function formatTime(isoString: string): string {
  return safely(
    () =>
      new Date(isoString).toLocaleTimeString(locale(), {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
    isoString
  );
}

/** "Mon, 23 Aug" - a date section header. */
export function formatDate(isoString: string): string {
  return safely(
    () =>
      new Date(isoString).toLocaleDateString(locale(), {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }),
    isoString
  );
}

/**
 * "22 minutes ago", "२२ मिनट पहले".
 *
 * Intl.RelativeTimeFormat does the wording, so this needs no strings of its own
 * and gains any language the app adds later for free. The previous version
 * hardcoded "m ago" and "Just now" in English.
 */
export function formatTimeAgo(isoString: string): string {
  return safely(() => {
    const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    const relative = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto', style: 'narrow' });

    if (seconds < 60) return relative.format(0, 'minute');
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return relative.format(-minutes, 'minute');
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return relative.format(-hours, 'hour');
    return relative.format(-Math.floor(hours / 24), 'day');
  }, isoString);
}

/**
 * Which day a timestamp belongs to, as a stable key.
 *
 * Compared as a local calendar date rather than by subtracting hours, so a pass
 * issued at 11pm and one at 1am land in different groups the way a person would
 * expect, and daylight saving cannot shift a row into yesterday.
 */
export function dayKey(isoString: string): string {
  const date = new Date(isoString);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/** How many days back a timestamp is: 0 today, 1 yesterday, and so on. */
export function daysAgo(isoString: string): number {
  const then = new Date(isoString);
  const start = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((today - start) / 86_400_000);
}

export function getVehicleLabel(type: string): { label: string; icon: string } {
  switch (type) {
    case 'TWO_WHEELER':
      return { label: '2 Wheeler', icon: 'Bike' };
    case 'FOUR_WHEELER':
      return { label: '4 Wheeler (Car)', icon: 'Car' };
    case 'HEAVY_VEHICLE':
      return { label: 'Heavy Vehicle / Bus', icon: 'Truck' };
    default:
      return { label: 'General Pass', icon: 'Ticket' };
  }
}
