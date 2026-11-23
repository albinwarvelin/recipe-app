import { SyncIndicator } from './SyncIndicator';
import { useSyncState } from '../hooks/useLocalData';

export function TopLevelPageHeader({ title }: { title: string }) {
  const sync = useSyncState();
  return <header className="navigation-bar top-level-header"><div className="navigation-bar-inner page-container"><h1 className="heading-3">{title}</h1><SyncIndicator state={sync} /></div></header>;
}

