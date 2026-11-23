import { useState } from 'react';
import type { LocalRecipe } from '../data/db';
import { dayLabel, validWeekStart, weekDays } from '../planning/week';
import { ModalSheet } from './ModalSheet';
import { WeekNavigator } from './WeekNavigator';

export function PlanRecipeSheet({ recipe, initialWeek, onAdd, onClose }: { recipe: LocalRecipe; initialWeek?: string; onAdd: (date: string) => void; onClose: () => void }) {
  const [week, setWeek] = useState(validWeekStart(initialWeek ?? null));
  return <ModalSheet title={`Planera ${recipe.title}`} onClose={onClose}>
    <WeekNavigator weekStart={week} onChange={setWeek} />
    <div className="plan-day-picker">{weekDays(week).map((date) => {
      const label = dayLabel(date);
      return <button type="button" className={label.isToday ? 'is-today' : ''} key={date} onClick={() => onAdd(date)}><span>{label.weekday}</span><small>{label.date}</small></button>;
    })}</div>
  </ModalSheet>;
}

