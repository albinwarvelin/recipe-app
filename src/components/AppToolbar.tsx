import type { ReactNode } from 'react';

export function AppToolbar({ title, leading, trailing }: {
  title: string;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  return <header className="app-toolbar">
    <div className="app-toolbar-inner page-container">
      <div className="app-toolbar-slot app-toolbar-leading">{leading}</div>
      <strong className="app-toolbar-title heading-3">{title}</strong>
      <div className="app-toolbar-slot app-toolbar-trailing">{trailing}</div>
    </div>
  </header>;
}
