'use client';

import { useState, useRef, useEffect } from 'react';

interface HelpTipProps {
  label: string;
  children: React.ReactNode;
}

export function HelpTip({ label, children }: HelpTipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Help: ${label}`}
        className="ml-1 inline-flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ucsd-gold)]"
      >
        ?
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 z-10 mb-2 w-64 -translate-x-1/2 rounded border border-[rgba(24,43,73,0.15)] bg-white p-3 text-xs leading-relaxed text-[var(--ucsd-text)] shadow-lg"
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
