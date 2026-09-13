// Server-side IST date utilities

export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export interface ISTFormattedDate {
  dayName: string;
  dateFormatted: string;
  timeFormatted: string;
  displayTitle: string;
  fullDisplay: string;
  dateInput: string;
  timeInput: string;
  hours: number;
  minutes: number;
}

/**
 * Safely extracts year, month, and day components from any date format:
 * - YYYY-MM-DD
 * - DD-MM-YYYY or DD/MM/YYYY
 * - ISO timestamps
 * - Date objects
 * - Epoch timestamps (ms)
 * Never throws an error or calls .split on undefined/non-strings.
 */
export function safeExtractDateParts(val: unknown): { year: number; month: number; day: number } | null {
  if (val === null || val === undefined) return null;

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(val);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '';
    const y = parseInt(getPart('year'), 10);
    const m = parseInt(getPart('month'), 10);
    const d = parseInt(getPart('day'), 10);
    return !isNaN(y) && !isNaN(m) && !isNaN(d) ? { year: y, month: m, day: d } : null;
  }

  if (typeof val === 'number') {
    return safeExtractDateParts(new Date(val));
  }

  if (typeof val !== 'string') return null;

  const s = val.trim();
  if (!s) return null;

  // Handle ISO string or date with time
  if (s.includes('T')) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return safeExtractDateParts(d);
    }
  }

  // Handle YYYY-MM-DD or DD-MM-YYYY / DD/MM/YYYY
  const match = s.match(/^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$/);
  if (match) {
    const p1 = parseInt(match[1], 10);
    const p2 = parseInt(match[2], 10);
    const p3 = parseInt(match[3], 10);

    // YYYY-MM-DD format (first group is 4 digits)
    if (match[1].length === 4) {
      const year = p1;
      const month = p2;
      const day = p3;
      if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return { year, month, day };
      }
    }
    // DD-MM-YYYY format (third group is 4 digits, Indian format)
    if (match[3].length === 4) {
      const year = p3;
      const day = p1;
      const month = p2;
      if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return { year, month, day };
      }
    }
  }

  // Fallback to standard JS Date parsing
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return safeExtractDateParts(parsed);
  }

  return null;
}

/**
 * Safely extracts 24-hour time parts (hour 0-23, minute 0-59) from strings like "15:00", "3:00 PM", "15:00:00"
 */
export function safeExtractTimeParts(val: unknown): { hour: number; minute: number } {
  if (!val || typeof val !== 'string') {
    return { hour: 15, minute: 0 };
  }

  const s = val.trim();
  if (!s) {
    return { hour: 15, minute: 0 };
  }

  // Handle 12-hour format: "3:00 PM", "03:30 am", "3 pm"
  const ampmMatch = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10);
    const minute = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
    const isPm = ampmMatch[3].toLowerCase() === 'pm';
    if (isPm && hour < 12) hour += 12;
    if (!isPm && hour === 12) hour = 0;
    return {
      hour: Math.min(23, Math.max(0, hour)),
      minute: Math.min(59, Math.max(0, minute)),
    };
  }

  // Handle 24-hour format: "15:00", "09:30", "15:00:00"
  const match = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    const hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);
    if (!isNaN(hour) && !isNaN(minute)) {
      return {
        hour: Math.min(23, Math.max(0, hour)),
        minute: Math.min(59, Math.max(0, minute)),
      };
    }
  }

  return { hour: 15, minute: 0 };
}

/**
 * Converts IST Date and Time inputs into a canonical UTC ISO-8601 string.
 * Accurately interprets the date and time in India Standard Time (+05:30).
 */
export function istToUtcIso(dateInput: unknown, timeInput?: unknown): string {
  const dateParts = safeExtractDateParts(dateInput);
  const timeParts = safeExtractTimeParts(timeInput);

  if (!dateParts) {
    const now = new Date();
    const fallbackParts = safeExtractDateParts(now) || { year: 2026, month: 9, day: 19 };
    const nominalUtcMs = Date.UTC(
      fallbackParts.year,
      fallbackParts.month - 1,
      fallbackParts.day,
      timeParts.hour,
      timeParts.minute,
      0,
      0
    );
    return new Date(nominalUtcMs - IST_OFFSET_MS).toISOString();
  }

  const nominalUtcMs = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    timeParts.hour,
    timeParts.minute,
    0,
    0
  );
  const realUtcMs = nominalUtcMs - IST_OFFSET_MS;
  return new Date(realUtcMs).toISOString();
}

/**
 * Parses any date/timestamp into rich IST display structures without throwing errors.
 */
export function parseISTDate(input: unknown): ISTFormattedDate {
  let d: Date;
  if (input instanceof Date) {
    d = isNaN(input.getTime()) ? new Date('2026-09-19T09:30:00.000Z') : input;
  } else if (typeof input === 'number') {
    d = new Date(input);
  } else if (typeof input === 'string' && input.trim()) {
    const s = input.trim();
    if (!s.includes('T') && (s.includes('-') || s.includes('/'))) {
      const parts = safeExtractDateParts(s);
      if (parts) {
        const nominal = Date.UTC(parts.year, parts.month - 1, parts.day, 15, 0, 0, 0);
        d = new Date(nominal - IST_OFFSET_MS);
      } else {
        d = new Date(s);
      }
    } else {
      d = new Date(s);
    }
  } else {
    d = new Date('2026-09-19T09:30:00.000Z');
  }

  if (isNaN(d.getTime())) {
    d = new Date('2026-09-19T09:30:00.000Z');
  }

  const dayName = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
  }).format(d);

  const dateFormatted = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);

  const timeFormatted = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const y = getPart('year') || '2026';
  const m = getPart('month') || '09';
  const dayVal = getPart('day') || '19';
  let h = getPart('hour') || '15';
  if (h === '24') h = '00';
  const min = getPart('minute') || '00';

  const dateInput = `${y}-${m}-${dayVal}`;
  const timeInput = `${h.padStart(2, '0')}:${min.padStart(2, '0')}`;

  const istDate = new Date(d.getTime() + IST_OFFSET_MS);
  const hours = istDate.getUTCHours();
  const minutes = istDate.getUTCMinutes();

  return {
    dayName,
    dateFormatted,
    timeFormatted,
    displayTitle: `${dayName} · ${timeFormatted}`,
    fullDisplay: `${dayName}, ${dateFormatted} · ${timeFormatted} IST`,
    dateInput,
    timeInput,
    hours,
    minutes,
  };
}

