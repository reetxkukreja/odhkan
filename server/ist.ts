// Server-side IST date utilities

export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export interface ISTFormattedDate {
  dayName: string;
  dateFormatted: string;
  timeFormatted: string;
  displayTitle: string;
  fullDisplay: string;
  hours: number;
  minutes: number;
}

export function parseISTDate(isoString: string): ISTFormattedDate {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) {
    return {
      dayName: 'Friday',
      dateFormatted: 'Upcoming',
      timeFormatted: '3:00 PM',
      displayTitle: 'Friday · 3:00 PM',
      fullDisplay: 'Friday · 3:00 PM IST',
      hours: 15,
      minutes: 0,
    };
  }

  const istDate = new Date(d.getTime() + IST_OFFSET_MS);
  const hours = istDate.getUTCHours();
  const minutes = istDate.getUTCMinutes();

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
  })
    .format(d)
    .toUpperCase();

  return {
    dayName,
    dateFormatted,
    timeFormatted,
    displayTitle: `${dayName} · ${timeFormatted}`,
    fullDisplay: `${dayName}, ${dateFormatted} · ${timeFormatted} IST`,
    hours,
    minutes,
  };
}

export function istToUtcIso(dateStr: string, timeStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const nominalUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const realUtcMs = nominalUtcMs - IST_OFFSET_MS;
  return new Date(realUtcMs).toISOString();
}
