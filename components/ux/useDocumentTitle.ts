'use client';

import { useEffect } from 'react';

/**
 * Sets a page title from a client page (server pages use `metadata`).
 * Next.js may write its own route title after this runs, so the title is
 * re-applied if the <title> changes while the page is shown. On unmount the
 * route's own title comes back, unless the next page has already set one.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    const apply = () => {
      if (document.title !== title) document.title = title;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (document.title === title) document.title = previous;
    };
  }, [title]);
}
