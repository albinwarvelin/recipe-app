import { useEffect, useRef, type ReactNode } from 'react';
import { CloseIcon } from './Icons';

export function ModalSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const sheet = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = sheet.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.querySelector<HTMLElement>('input, button:not(:disabled), a[href]')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab' || !element) return;
      const focusable = [...element.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled), a[href]')];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [onClose]);
  return <div className="dialog-backdrop sheet-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={sheet} className="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="modal-sheet-title">
      <header><h2 className="heading-2" id="modal-sheet-title">{title}</h2><button className="menu-button" type="button" aria-label="Stäng" onClick={onClose}><CloseIcon /></button></header>
      {children}
    </section>
  </div>;
}

