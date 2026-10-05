import { format } from 'date-fns';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useData, useQuery } from '../data/DataProvider';
import type { DeletionRequest } from '../domain/types';
import { usePermissions } from '../hooks/usePermissions';
import { radius, spacing, usePalette } from '../theme';
import { Button, Card, SectionTitle } from './ui';

const KIND = { article: 'Artikel', job: 'Auftrag', entry: 'Abschnitt' } as const;
const STATUS = { open: 'offen', approved: 'bestätigt – wird ausgeführt', rejected: 'abgelehnt', done: 'gelöscht' } as const;

/**
 * Löschvorschläge: Der Admin entscheidet (Löschen / Ablehnen), alle anderen sehen den Stand ihrer Vorschläge.
 * Wird nur angezeigt, wenn es Vorschläge gibt.
 */
export function DeletionRequestsCard({ nameOf }: { nameOf: (login: string | null | undefined) => string }) {
  const p = usePalette();
  const perms = usePermissions();
  const { mutate } = useData();
  const { data } = useQuery((r) => r.requests.list());
  const [error, setError] = useState<string | null>(null);

  const all = data ?? [];
  const visible = perms.isAdmin ? all : all.filter((r) => r.requestedBy === perms.me);
  const open = visible.filter((r) => r.status === 'open' || r.status === 'approved');
  const recent = visible.filter((r) => r.status === 'rejected' || r.status === 'done').slice(0, 5);
  if (visible.length === 0) return null;

  const approve = (r: DeletionRequest) =>
    mutate(async (repos) => {
      const ownData = r.kind === 'article' || !perms.team || !r.owner || r.owner === perms.me;
      if (!ownData) return repos.requests.setStatus(r.id, 'approved'); // Gerät des Besitzers löscht
      if (r.kind === 'article') await repos.articles.remove(r.targetId);
      else if (r.kind === 'job') await repos.jobs.remove(r.targetId).catch(() => {});
      else await repos.entries.remove(r.targetId).catch(() => {});
      await repos.requests.setStatus(r.id, 'done');
    }).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));

  const reject = (r: DeletionRequest) => mutate((repos) => repos.requests.setStatus(r.id, 'rejected'));

  return (
    <>
      <SectionTitle>Löschvorschläge{open.length ? ` (${open.length})` : ''}</SectionTitle>
      <Card style={{ gap: spacing.md }}>
        {open.length === 0 && <Text style={{ color: p.muted }}>Keine offenen Vorschläge.</Text>}
        {open.map((r) => (
          <View key={r.id} style={[styles.item, { borderColor: p.border }]}>
            <Text style={{ color: p.text, fontWeight: '700' }}>
              {KIND[r.kind]}: {r.label}
            </Text>
            <Text style={{ color: p.muted, fontSize: 13 }}>
              von {nameOf(r.requestedBy)} · {format(r.createdAt, 'dd.MM. HH:mm')}
              {r.owner && r.kind !== 'article' ? ` · gehört ${nameOf(r.owner)}` : ''}
            </Text>
            {r.reason ? <Text style={{ color: p.text }}>„{r.reason}“</Text> : null}
            {r.status === 'approved' ? (
              <Text style={{ color: p.muted }}>{STATUS.approved}</Text>
            ) : perms.isAdmin ? (
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Button title="Ablehnen" variant="secondary" onPress={() => void reject(r)} accessibilityLabel={`Löschvorschlag ${r.label} ablehnen`} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title="Löschen" icon="trash-outline" variant="danger" onPress={() => void approve(r)} accessibilityLabel={`${r.label} löschen`} />
                </View>
              </View>
            ) : (
              <Text style={{ color: p.muted }}>{STATUS.open} – der Admin entscheidet</Text>
            )}
          </View>
        ))}
        {recent.length > 0 && (
          <Text style={{ color: p.muted, fontSize: 12 }}>
            Zuletzt: {recent.map((r) => `${r.label} (${STATUS[r.status]})`).join(' · ')}
          </Text>
        )}
        {error && <Text style={{ color: p.danger }}>{error}</Text>}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  item: { gap: 4, paddingBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm },
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
});
