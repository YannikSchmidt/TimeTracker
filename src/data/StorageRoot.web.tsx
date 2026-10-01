import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { TeamContext, type TeamState } from '../sync/TeamContext';
import { TeamSync } from '../sync/TeamSync.web';
import { usePalette } from '../theme';
import { DataProvider } from './DataProvider';

/**
 * Browser-Version: Daten lokal in IndexedDB (offline nutzbar) und – wenn verbunden –
 * verschlüsselter Abgleich mit dem privaten Daten-Repo des Teams.
 */
export function StorageRoot({ children }: { children: ReactNode }) {
  const p = usePalette();
  const [sync, setSync] = useState<TeamSync | null>(null);

  useEffect(() => {
    void TeamSync.load().then(setSync);
  }, []);

  if (!sync) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: p.background }}>
        <ActivityIndicator size="large" color={p.primary} />
      </View>
    );
  }
  return <SyncedData sync={sync}>{children}</SyncedData>;
}

function SyncedData({ sync, children }: { sync: TeamSync; children: ReactNode }) {
  const state = useSyncExternalStore(sync.subscribeState, sync.getState);
  const team: TeamState = useMemo(
    () => ({
      ...state,
      syncNow: sync.syncNow,
      connect: sync.connect,
      disconnect: sync.disconnect,
      setLocalOnly: sync.setLocalOnly,
    }),
    [state, sync],
  );
  return (
    <TeamContext.Provider value={team}>
      <DataProvider repos={sync.store.repos} subscribe={sync.subscribeData}>
        {children}
      </DataProvider>
    </TeamContext.Provider>
  );
}
