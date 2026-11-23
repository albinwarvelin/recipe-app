import { ArrowLeftIcon } from './Icons';
import { addDays, mondayFor, weekLabel } from '../planning/week';

export function WeekNavigator({ weekStart, onChange }: { weekStart: string; onChange: (weekStart: string) => void }) {
  const current = mondayFor();
  return <div className="week-navigator">
    <button type="button" aria-label="Föregående vecka" onClick={() => onChange(addDays(weekStart, -7))}><ArrowLeftIcon /></button>
    <div><strong>{weekLabel(weekStart)}</strong>{weekStart !== current && <button type="button" onClick={() => onChange(current)}>Denna vecka</button>}</div>
    <button type="button" aria-label="Nästa vecka" onClick={() => onChange(addDays(weekStart, 7))}><ArrowLeftIcon className="next-week-icon" /></button>
  </div>;
}

