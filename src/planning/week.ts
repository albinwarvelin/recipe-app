export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function fromDateKey(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

export function addDays(value: string, days: number): string {
  const date = fromDateKey(value);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function mondayFor(value: Date | string = new Date()): string {
  const date = typeof value === 'string' ? fromDateKey(value) : new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
  const weekday = date.getDay() || 7;
  date.setDate(date.getDate() - weekday + 1);
  return toDateKey(date);
}

export function validWeekStart(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return mondayFor();
  const date = fromDateKey(value);
  return Number.isNaN(date.getTime()) ? mondayFor() : mondayFor(date);
}

export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

export function weekLabel(weekStart: string): string {
  const start = fromDateKey(weekStart);
  const end = fromDateKey(addDays(weekStart, 6));
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const sameYear = start.getFullYear() === end.getFullYear();
  if (sameMonth) return `${start.getDate()}–${end.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  if (sameYear) return `${start.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}–${end.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  return `${start.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}–${end.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export function dayLabel(dateKey: string): { weekday: string; date: string; isToday: boolean } {
  const date = fromDateKey(dateKey);
  return {
    weekday: date.toLocaleDateString('sv-SE', { weekday: 'long' }),
    date: date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }),
    isToday: dateKey === toDateKey(new Date()),
  };
}

