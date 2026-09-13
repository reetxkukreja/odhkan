// India Standard Time (IST, UTC+5:30) utility functions

export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export interface ISTFormattedDate {
  dayName: string; // e.g. "Friday"
  dateFormatted: string; // e.g. "19 September 2026"
  timeFormatted: string; // e.g. "3:00 PM"
  displayTitle: string; // e.g. "Friday · 3:00 PM"
  fullDisplay: string; // e.g. "Friday, 19 September 2026 · 3:00 PM IST"
  dateInput: string; // e.g. "2026-09-19"
  timeInput: string; // e.g. "15:00"
}

export function parseISTDate(isoString: string): ISTFormattedDate {
  const d = new Date(isoString);
  // Guard against invalid date
  if (isNaN(d.getTime())) {
    return {
      dayName: 'Friday',
      dateFormatted: 'Upcoming',
      timeFormatted: '3:00 PM',
      displayTitle: 'Friday · 3:00 PM',
      fullDisplay: 'Friday · 3:00 PM IST',
      dateInput: '2026-09-19',
      timeInput: '15:00',
    };
  }

  // Use Intl.DateTimeFormat with Asia/Kolkata
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

  // Date and Time inputs (24h) for <input type="date"> and <input type="time">
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
  const dateInput = `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
  const timeInput = `${getPart('hour')}:${getPart('minute')}`;

  return {
    dayName,
    dateFormatted,
    timeFormatted,
    displayTitle: `${dayName} · ${timeFormatted}`,
    fullDisplay: `${dayName}, ${dateFormatted} · ${timeFormatted} IST`,
    dateInput,
    timeInput,
  };
}

export function istToUtcIso(dateStr: string, timeStr: string): string {
  // dateStr: "2026-09-19", timeStr: "15:00"
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  // IST is UTC + 5:30. To convert IST to UTC ms, subtract 5.5 hours from the nominal UTC timestamp
  const nominalUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const realUtcMs = nominalUtcMs - IST_OFFSET_MS;
  return new Date(realUtcMs).toISOString();
}
