import { NavLink, useLocation } from 'react-router';
import { BookIcon, CalendarIcon, CartIcon } from './Icons';
import { validWeekStart } from '../planning/week';

export function BottomTabBar() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const week = validWeekStart(params.get('week'));
  return <nav className="bottom-tab-bar" aria-label="Huvudnavigering">
    <div className="bottom-tab-inner">
      <NavLink to="/" end><BookIcon /><span>Recept</span></NavLink>
      <NavLink to={`/plan?week=${week}`}><CalendarIcon /><span>Planera</span></NavLink>
      <NavLink to={`/shopping?week=${week}`}><CartIcon /><span>Handla</span></NavLink>
    </div>
  </nav>;
}

