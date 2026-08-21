export interface TimerDurationParts {
  hours: number;
  minutes: number;
}

export function timerDurationParts(seconds: number | null | undefined): TimerDurationParts {
  const totalMinutes = seconds ? Math.max(0, Math.round(seconds / 60)) : 0;
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

export function timerDurationSeconds(hours: number, minutes: number, maximumSeconds: number): number | null {
  const total = Math.min(maximumSeconds, Math.max(0, hours * 3_600 + minutes * 60));
  return total || null;
}

export function formatTimerDuration(seconds: number): string {
  const { hours, minutes } = timerDurationParts(seconds);
  if (!hours) return `${minutes} min`;
  return minutes ? `${hours} tim ${minutes} min` : `${hours} tim`;
}
