'use client';

import { useEffect, useState } from 'react';
import { CommandPalette } from './CommandPalette';
import { useCommandPalette } from '@/hooks/useCommandPalette';

interface CommandPaletteProviderProps {
  children: React.ReactNode;
  onOpenProcessModal?: () => void;
}

export function CommandPaletteProvider({ children, onOpenProcessModal }: CommandPaletteProviderProps) {
  const { isOpen, open, close, toggle } = useCommandPalette();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Command/Ctrl + K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
      }

      // Escape key
      if (e.key === 'Escape' && isOpen) {
        close();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, toggle, close]);

  return (
    <>
      {children}
      <CommandPalette
        open={isOpen}
        onOpenChange={(open) => (open ? open() : close())}
        onOpenProcessModal={onOpenProcessModal}
      />
    </>
  );
}
