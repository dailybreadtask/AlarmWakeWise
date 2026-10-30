import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import type { ContextScope } from '../domain/context';
import { hasConsent as readConsent, setConsent, type ConsentMap } from './consent';
import { loadConsent, saveConsent } from './consentRepository';

interface ConsentContextValue {
  /** False until the saved choices have loaded, so nothing is allowed by default. */
  ready: boolean;
  hasConsent: (scope: ContextScope) => boolean;
  /** Returns false if the choice could not be saved, and leaves the old value in place. */
  setScope: (scope: ContextScope, granted: boolean) => Promise<boolean>;
}

const ConsentContext = createContext<ConsentContextValue | null>(null);

export function ConsentProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [map, setMap] = useState<ConsentMap>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    loadConsent(db)
      .then((loaded) => active && setMap(loaded))
      .catch(() => undefined)
      .finally(() => active && setReady(true));
    return () => {
      active = false;
    };
  }, [db]);

  const setScope = useCallback(
    async (scope: ContextScope, granted: boolean) => {
      const entry = { granted, changedAt: new Date().toISOString() };
      try {
        await saveConsent(db, scope, entry);
      } catch {
        return false;
      }
      setMap((current) => setConsent(current, scope, granted, entry.changedAt));
      return true;
    },
    [db],
  );

  const value = useMemo<ConsentContextValue>(
    () => ({ ready, hasConsent: (scope) => readConsent(map, scope), setScope }),
    [ready, map, setScope],
  );

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export function useConsent(): ConsentContextValue {
  const value = useContext(ConsentContext);
  if (!value) throw new Error('useConsent must be used inside ConsentProvider');
  return value;
}
