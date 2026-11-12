import { useState, useEffect } from 'react';
import CommandPalette from './CommandPalette';
export function useCommandPalette(onNavigate, onAction) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const palette = (
    <CommandPalette
      isOpen={open}
      onClose={() => setOpen(false)}
      onNavigate={onNavigate}
      onAction={onAction}
    />
  );

  return { paletteOpen: open, setPaletteOpen: setOpen, palette };
}
