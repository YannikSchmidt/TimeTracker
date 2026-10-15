import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { useData, useQuery } from '../data/DataProvider';
import { maxWorkers, personSegments } from '../domain/jobs';
import { formatDuration } from '../domain/time';
import type { Entry, Job, TimeHandover } from '../domain/types';
import { useWork } from '../hooks/useWork';
import { personId } from '../sync/invite';
import { radius, spacing, usePalette } from '../theme';
import { Button, Card, Chip } from './ui';

const handoverMs = (h: TimeHandover) => h.segments.reduce((s, x) => s + (x.endAt - x.startAt), 0);

/**
 * Nach „Fertig“ mit Personenzähler > 1: Wer hat mitgearbeitet? Jede benannte Person bekommt ihre Zeit als Übergabe
 * und kann sie als eigenen Auftrag übernehmen – auch Personen, die noch nicht im Team sind (sie werden beim
 * Beitreten gefragt). Danach zählt der eigene Auftrag nur noch 1 Person.
 */
export function HandoverCard({ job, entries, label }: { job: Job; entries: Entry[]; label: string }) {
  const p = usePalette();
  const { mutate } = useData();
  const work = useWork();
  const { data: handovers } = useQuery((r) => r.handovers.list());
  const extra = maxWorkers(entries) - 1;
  const [names, setNames] = useState<string[]>(() => Array.from({ length: Math.max(0, extra) }, () => ''));
  const [withSteps, setWithSteps] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const already = (handovers ?? []).some((h) => h.jobId === job.id);
  // Bestätigung zuerst – nach dem Übergeben zählt der Auftrag nur noch 1 Person
  if (done) {
    return (
      <Card style={[styles.card, { borderColor: p.success }]}>
        <Text style={{ color: p.text }}>{done}</Text>
      </Card>
    );
  }
  if (job.kind !== 'order' || extra < 1 || hidden || already) return null;

  const team = work.others.map((login) => ({ login, name: work.nameOf(login) }));
  const set = (i: number, v: string) => setNames(names.map((n, j) => (j === i ? v : n)));
  const submit = async () => {
    setError(null);
    const list = names.map((n) => n.trim()).filter(Boolean);
    try {
      await mutate(async (r) => {
        for (const [i, raw] of names.entries()) {
          const name = raw.trim();
          if (!name) continue;
          const member = team.find((m) => m.name.toLowerCase() === name.toLowerCase() || m.login === name.toLowerCase());
          await r.handovers.create({
            fromName: work.nameOf(work.me),
            to: member?.login ?? personId(name),
            toName: member?.name ?? name,
            jobId: job.id,
            orderNo: job.orderNo,
            articleId: job.articleId,
            section: job.section ?? null,
            quantity: job.quantity,
            label,
            withSteps,
            // Person i+2 hat die Abschnitte mitgearbeitet, in denen mindestens so viele Personen eingetragen waren
            segments: personSegments(entries, i + 2),
          });
        }
        await r.jobs.setWorkersAll(job.id, 1);
      });
      setDone(`Übergeben an ${list.join(', ')} – sie können die Zeit nach dem nächsten Abgleich übernehmen.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Card style={[styles.card, { borderColor: p.primary }]}>
      <View style={styles.head}>
        <Ionicons name="people-outline" size={20} color={p.primary} />
        <Text style={[styles.title, { color: p.text }]}>Wer hat mitgearbeitet?</Text>
      </View>
      <Text style={{ color: p.muted, fontSize: 12 }}>
        Optional: Jede benannte Person bekommt ihre Zeit als eigenen Auftrag (auch wer noch nicht im Team ist – sie wird beim
        Beitreten gefragt). Dein Auftrag zählt danach nur noch dich.
      </Text>
      {names.map((n, i) => (
        <View key={i} style={{ gap: spacing.xs }}>
          <TextInput
            value={n}
            onChangeText={(v) => set(i, v)}
            placeholder={`Person ${i + 2}: Name`}
            placeholderTextColor={p.muted}
            accessibilityLabel={`Name Person ${i + 2}`}
            style={[styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.card }]}
          />
          {team.length > 0 && (
            <View style={styles.chips}>
              {team
                .filter((m) => !names.some((x, j) => j !== i && x.trim().toLowerCase() === m.name.toLowerCase()))
                .slice(0, 6)
                .map((m) => (
                  <Chip key={m.login} label={m.name} selected={n.trim().toLowerCase() === m.name.toLowerCase()} onPress={() => set(i, m.name)} />
                ))}
            </View>
          )}
        </View>
      ))}
      <View style={styles.switchRow}>
        <Text style={{ color: p.text, flex: 1 }}>Zeit auch auf die Arbeitsschritte buchen</Text>
        <Switch value={withSteps} onValueChange={setWithSteps} accessibilityLabel="Zeit auch auf die Arbeitsschritte buchen" />
      </View>
      <Text style={{ color: p.muted, fontSize: 12 }}>{withSteps ? 'Die Zeit wird mit den Schritten übergeben.' : 'Die Zeit zählt nur auf den Auftrag, ohne Schritte.'}</Text>
      {error && <Text style={{ color: p.danger }}>{error}</Text>}
      <Button title="Zeit übergeben" icon="send-outline" onPress={() => void submit()} disabled={!names.some((n) => n.trim())} />
      <Button title="Überspringen" variant="secondary" onPress={() => setHidden(true)} />
    </Card>
  );
}

/** Timer-Tab: offene Zeitübergaben an mich – übernehmen (eigener Auftrag) oder ablehnen. */
export function HandoverInbox() {
  const p = usePalette();
  const { mutate } = useData();
  const work = useWork();
  const { data: handovers } = useQuery((r) => r.handovers.list());
  if (!work.me) return null;
  const myName = work.nameOf(work.me).toLowerCase();
  const mine = (handovers ?? []).filter(
    (h) => h.status === 'open' && h.from !== work.me && (h.to === work.me || h.toName.trim().toLowerCase() === myName),
  );
  if (mine.length === 0) return null;

  const accept = (h: TimeHandover) =>
    mutate(async (r) => {
      await r.jobs.createFromHandover(h);
      await r.handovers.setStatus(h.id, 'accepted');
    });
  const decline = (h: TimeHandover) => mutate((r) => r.handovers.setStatus(h.id, 'declined'));

  return (
    <View style={{ gap: spacing.sm }}>
      {mine.map((h) => (
        <Card key={h.id} style={[styles.card, { borderColor: p.primary }]}>
          <View style={styles.head}>
            <Ionicons name="time-outline" size={20} color={p.primary} />
            <Text style={[styles.title, { color: p.text }]}>Zeit übernehmen?</Text>
          </View>
          <Text style={{ color: p.text }}>
            {h.fromName} hat dich bei <Text style={{ fontWeight: '700' }}>{h.label}</Text> als Mitarbeiter eingetragen:{' '}
            {formatDuration(handoverMs(h))}
            {h.withSteps ? ' (mit Arbeitsschritten)' : ' (nur auf den Auftrag)'}.
          </Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Button title="Übernehmen" icon="checkmark" variant="success" onPress={() => void accept(h)} accessibilityLabel={`Zeit ${h.label} übernehmen`} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Ablehnen" variant="secondary" onPress={() => void decline(h)} accessibilityLabel={`Zeit ${h.label} ablehnen`} />
            </View>
          </View>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, borderWidth: 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: 16, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 44, fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
});
