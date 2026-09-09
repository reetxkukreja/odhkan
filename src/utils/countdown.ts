import { CountdownTime } from '../types';

export function calculateCountdown(targetDateStr: string): CountdownTime {
  const targetTime = new Date(targetDateStr).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, targetTime - now);

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / (3600 * 24));
  const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    days,
    hours,
    minutes,
    seconds,
    totalSeconds,
    isZero: totalSeconds <= 0,
  };
}

export function formatCountdownString(t: CountdownTime): string {
  if (t.isZero) {
    return '0d 00h 00m 00s';
  }
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${t.days}d ${pad(t.hours)}h ${pad(t.minutes)}m ${pad(t.seconds)}s`;
}
