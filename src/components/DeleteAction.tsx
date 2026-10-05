import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { useData, useQuery } from '../data/DataProvider';
import type { DeletionKind } from '../domain/types';
import type { Repositories } from '../repositories/types';
import { usePermissions } from '../hooks/usePermissions';
import { radius, spacing, usePalette } from '../theme';
import { Button } from './ui';

/**
 * Löschen-Knopf mit Rechten: Admins löschen (nach Rückfrage), alle anderen schlagen die Löschung mit Begründung vor.
 * Gehört der Auftrag/Abschnitt einer anderen Person, wird die Löschung auf deren Gerät ausgeführt.
 */
export function DeleteAction({
  kind,
  targetId,
  owner,
  label,
  title,
  hint,
  ownerName,
  doDelete,
  onDone,
}: {
  kind: DeletionKind;
  targetId: string;
  /** Besitzer (Kennung) bei Aufträgen/Abschnitten */
  owner: string | null;
  label: string;
  title: string;
  hint?: string;
  ownerName?: string;
  /** lokal löschen (eigene Daten bzw. Artikel) */
  doDelete: (repos: Repositories) => Promise<void>;
  onDone: () => void;
}) {
  const p = usePalette();
  const { mutate } = useData();
  const perms = usePermissions();
  const { data: requests } = useQuery((r) => r.requests.list());
  const [confirm, setConfirm] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = (requests ?? []).find((r) => r.targetId === targetId && (r.status === 'open' || r.status === 'approved'));
  const foreign = perms.team && kind !== 'article' && !!owner && owner !== perms.me;

  const run = async (fn: () => Promise<void>, done: () => void) => {
    setError(null);
    try {
      await fn();
      done();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (perms.isAdmin) {
    const remove = () =>
      run(
        () =>
          mutate(async (r) => {
            if (foreign) {
              await r.requests.create({ kind, targetId, owner, label, reason: reason || 'vom Admin gelöscht', status: 'approved' });
            } else {
              await doDelete(r);
            }
            // offene Vorschläge zum selben Ziel erledigen
            for (const q of await r.requests.list()) {
              if (q.targetId === targetId && q.status === 'open') await r.requests.setStatus(q.id, foreign ? 'approved' : 'done');
            }
          }),
        foreign ? () => setMessage(`Wird beim nächsten Abgleich auf dem Gerät von ${ownerName ?? owner} gelöscht.`) : onDone,
      );
    return (
      <View style={{ gap: spacing.sm }}>
        {pending?.status === 'open' && (
          <Text style={{ color: p.warning }}>
            Löschung vorgeschlagen von {pending.requestedBy ?? 'jemandem'}
            {pending.reason ? `: „${pending.reason}“` : ''}
          </Text>
        )}
        {pending?.status === 'approved' || message ? (
          <Text style={{ color: p.muted }}>{message ?? 'Löschung bestätigt – wird beim nächsten Abgleich auf dem Gerät des Besitzers ausgeführt.'}</Text>
        ) : (
          <>
            <Button
              title={confirm ? 'Wirklich löschen?' : title}
              icon="trash-outline"
              variant={confirm ? 'danger' : 'secondary'}
              onPress={() => (confirm ? void remove() : setConfirm(true))}
            />
            {confirm && (
              <>
                {hint ? <Text style={{ color: p.muted, fontSize: 12 }}>{hint}</Text> : null}
                <Button title="Abbrechen" variant="secondary" onPress={() => setConfirm(false)} />
              </>
            )}
          </>
        )}
        {error && <Text style={{ color: p.danger }}>{error}</Text>}
      </View>
    );
  }

  // Keine Admin-Rechte → Löschung vorschlagen
  if (pending || message) {
    return (
      <Text style={[styles.note, { color: p.muted, backgroundColor: p.track }]}>
        {message ?? (pending?.status === 'approved' ? 'Löschung bestätigt – wird gleich ausgeführt.' : 'Löschung vorgeschlagen – der Admin entscheidet.')}
      </Text>
    );
  }
  const propose = () =>
    run(
      () => mutate((r) => r.requests.create({ kind, targetId, owner, label, reason }).then(() => undefined)),
      () => setMessage('Löschung vorgeschlagen – der Admin entscheidet.'),
    );
  return (
    <View style={{ gap: spacing.sm }}>
      {proposing ? (
        <>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Warum soll das gelöscht werden?"
            placeholderTextColor={p.muted}
            accessibilityLabel="Grund für die Löschung"
            style={[styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.card }]}
          />
          <Button title="Löschung vorschlagen" icon="send" onPress={() => void propose()} disabled={!reason.trim()} />
          <Button title="Abbrechen" variant="secondary" onPress={() => setProposing(false)} />
        </>
      ) : (
        <Button title={`${title} (vorschlagen)`} icon="trash-outline" variant="secondary" onPress={() => setProposing(true)} />
      )}
      <Text style={{ color: p.muted, fontSize: 12 }}>Löschen darf nur der Admin – dein Vorschlag landet bei ihm.</Text>
      {error && <Text style={{ color: p.danger }}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 48, fontSize: 16 },
  note: { padding: spacing.sm, borderRadius: radius.sm, overflow: 'hidden' },
});
