import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { jobName, jobTimes } from '../domain/jobs';
import { formatClock, formatDuration } from '../domain/time';
import type { Article, Entry, Job } from '../domain/types';
import { articleDetails } from '../hooks/useArticles';
import { useJobActions } from '../hooks/useJobActions';
import { orderColor, radius, spacing, usePalette } from '../theme';
import { Button } from './ui';

export interface SubJob {
  job: Job;
  entries: Entry[];
}

/**
 * Kachel eines offenen Auftrags: Farbe pro Auftragsnummer, große Arbeitszeit, wichtigste Knöpfe.
 * Offene Nacharbeiten zum Auftrag stehen mit eigenen Knöpfen in derselben Kachel.
 */
export function JobCard({
  job,
  entries,
  article,
  reworks = [],
  now,
}: {
  job: Job;
  entries: Entry[];
  article?: Article;
  /** offene Nacharbeiten zu diesem Auftrag */
  reworks?: SubJob[];
  now: number;
}) {
  const p = usePalette();
  const actions = useJobActions();
  const t = jobTimes(job, entries, now);
  const running = job.status === 'running';
  const rework = job.kind === 'rework';
  const anyRunning = running || reworks.some((r) => r.job.status === 'running');
  const color = orderColor(job.orderNo) ?? p.muted;
  const state = rework ? p.warning : running ? p.success : p.muted;
  const name = jobName(job, article);
  const details = [...(article ? articleDetails(article) : []), job.quantity != null ? `${job.quantity} Stk` : '']
    .filter(Boolean)
    .join(' · ');

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: p.card,
          borderColor: anyRunning ? p.success : color + '66',
          borderWidth: anyRunning ? 2 : 1,
        },
      ]}
    >
      <View style={[styles.stripe, { backgroundColor: color }]} />
      <View style={styles.inner}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${name} öffnen`} onPress={() => router.push(`/job/${job.id}`)} style={styles.body}>
          <View style={styles.headRow}>
            <View style={[styles.pill, { backgroundColor: state + '22' }]}>
              <View style={[styles.dot, { backgroundColor: state }]} />
              <Text style={{ color: state, fontWeight: '700', fontSize: 12 }}>
                {rework ? 'NACHARBEIT · ' : ''}
                {running ? 'LÄUFT' : 'PAUSIERT'}
              </Text>
            </View>
            {job.orderNo ? (
              <View style={[styles.pill, { backgroundColor: color + '22' }]}>
                <Text style={{ color, fontWeight: '700', fontSize: 12 }}>{job.orderNo}</Text>
              </View>
            ) : null}
            <View style={{ flex: 1 }} />
            <Ionicons name="chevron-forward" size={18} color={p.muted} />
          </View>
          <Text style={[styles.title, { color: p.text }]} numberOfLines={1}>
            {name}
          </Text>
          {details ? (
            <Text style={{ color: p.muted }} numberOfLines={1}>
              {details}
            </Text>
          ) : null}
          <View style={styles.timeRow}>
            <Text style={[styles.clock, { color: running ? p.text : p.muted }]}>{formatClock(t.workMs)}</Text>
            <Text style={{ color: p.muted, fontSize: 12 }}>Arbeitszeit · gesamt {formatDuration(t.totalMs)}</Text>
          </View>
        </Pressable>
        <View style={styles.buttons}>
          <View style={{ flex: 2 }}>
            {running ? (
              <Button title="Pause" icon="pause" variant="secondary" size="large" onPress={() => void actions.pause(job)} accessibilityLabel={`${name} pausieren`} />
            ) : (
              <Button title="Weiter" icon="play" variant="success" size="large" onPress={() => void actions.resume(job)} accessibilityLabel={`${name} fortsetzen`} />
            )}
          </View>
          <View style={{ flex: 1.4 }}>
            <Button title="Fertig" icon="checkmark" variant={rework ? 'warning' : 'primary'} size="large" onPress={() => void actions.finish(job)} accessibilityLabel={`${name} beenden`} />
          </View>
        </View>

        {reworks.map((r) => (
          <ReworkRow key={r.job.id} sub={r} parentName={name} now={now} />
        ))}

        {!rework && (
          <Pressable accessibilityRole="button" accessibilityLabel={`Nacharbeit zu ${name} starten`} onPress={() => void actions.startRework(job)} style={styles.reworkLink}>
            <Ionicons name="construct-outline" size={16} color={p.warning} />
            <Text style={{ color: p.warning, fontWeight: '600' }}>Nacharbeit starten</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** Nacharbeit innerhalb der Auftragskachel */
function ReworkRow({ sub, parentName, now }: { sub: SubJob; parentName: string; now: number }) {
  const p = usePalette();
  const actions = useJobActions();
  const { job } = sub;
  const running = job.status === 'running';
  const t = jobTimes(job, sub.entries, now);
  const label = `Nacharbeit · ${parentName}`;
  return (
    <View style={[styles.sub, { borderColor: p.warning, backgroundColor: p.warning + (running ? '1f' : '0d') }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} öffnen`} onPress={() => router.push(`/job/${job.id}`)} style={{ flex: 1 }}>
        <Text style={{ color: p.warning, fontWeight: '700', fontSize: 12 }} numberOfLines={1}>
          NACHARBEIT
        </Text>
        <Text style={[styles.subClock, { color: running ? p.text : p.muted }]} numberOfLines={1}>
          {formatClock(t.workMs)}
        </Text>
        <Text style={{ color: running ? p.success : p.muted, fontSize: 11 }}>{running ? 'läuft' : 'pausiert'}</Text>
      </Pressable>
      {running ? (
        <Button title="Pause" icon="pause" variant="secondary" onPress={() => void actions.pause(job)} accessibilityLabel={`${label} pausieren`} />
      ) : (
        <Button title="Weiter" icon="play" variant="success" onPress={() => void actions.resume(job)} accessibilityLabel={`${label} fortsetzen`} />
      )}
      <Button title="Fertig" icon="checkmark" variant="warning" onPress={() => void actions.finish(job)} accessibilityLabel={`${label} beenden`} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, flexDirection: 'row', overflow: 'hidden' },
  stripe: { width: 6 },
  inner: { flex: 1, padding: spacing.lg, gap: spacing.md },
  body: { gap: 4 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  dot: { width: 8, height: 8, borderRadius: 4 },
  title: { fontSize: 20, fontWeight: '700', marginTop: 4 },
  timeRow: { marginTop: spacing.sm },
  clock: { fontSize: 40, fontWeight: '300', fontVariant: ['tabular-nums'] },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  sub: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm },
  subClock: { fontSize: 22, fontWeight: '300', fontVariant: ['tabular-nums'] },
  reworkLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
});
