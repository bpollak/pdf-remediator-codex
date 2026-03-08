'use client';

import { useEffect, useRef } from 'react';

interface CollapsibleSectionProps {
  id: string;
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function CollapsibleSection({
  id,
  title,
  subtitle,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  // Auto-open when the section is targeted by a hash link
  useEffect(() => {
    function handleHashChange() {
      if (window.location.hash === `#${id}` && detailsRef.current) {
        detailsRef.current.open = true;
      }
    }
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [id]);

  // Also handle clicks on anchor links that target this section
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      if (anchor?.getAttribute('href') === `#${id}` && detailsRef.current) {
        detailsRef.current.open = true;
      }
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [id]);

  return (
    <details
      ref={detailsRef}
      id={id}
      className="group scroll-mt-24 rounded border border-[rgba(24,43,73,0.2)] bg-white shadow-sm"
      open={defaultOpen || undefined}
    >
      <summary className="flex cursor-pointer select-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden list-none">
        <span
          className="inline-block text-[var(--ucsd-text)] transition-transform group-open:rotate-90"
          aria-hidden="true"
        >
          &#9654;
        </span>
        <div>
          <h2 className="inline">{title}</h2>
          {subtitle && (
            <p className="mt-1 text-sm text-[var(--ucsd-text)]">{subtitle}</p>
          )}
        </div>
      </summary>
      <div className="px-4 pb-4 pt-2">
        {children}
      </div>
    </details>
  );
}
