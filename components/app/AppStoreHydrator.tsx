'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/stores/app-store';

export function AppStoreHydrator() {
  const hydrateFromPersistence = useAppStore((state) => state.hydrateFromPersistence);

  useEffect(() => {
    void hydrateFromPersistence();
  }, [hydrateFromPersistence]);

  return null;
}
