import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { jobName, jobTimes } from '../domain/jobs';
import { formatClock, formatDuration } from '../domain/time';
import type { Article, Entry, Job } from '../domain/types';
import { articleDetails } from '../hooks/useArticles';
import { useJobActions } from '../hooks/useJobActions';
import { radius, spacing, usePalette } from '../theme';
import { Button } from './ui';

/** Karte eines offenen Auftrags mit großer Arbeitszeit und den wichtigsten Knöpfen. */
export function JobCard({
  job,
  entries,
  article,
  now,
}: {
  job: Job;
  entries: Entry[];
  article?: Article;
  now: number;
}) {
  const p = usePalette();
  const actions = useJobActions();
  const t = jobTimes(job, entries, now);
  const running = job.status === 'running';
  const rework = job.kind === 'rework';
  const accent = rework ? p.warning : running ? p.success : p.muted;
  const name = jobName(job, article);
  const details = [...(article ? articleDetails(article) : []), job.quantity != null ? `${job.quantity} Stk` : '']
    .filter(Boolean)
    .join(' · ');

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: p.card, borderColor: running ? accent : p.border, borderWidth: running ? 2 : StyleSheet.hairlineWidth },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name} öffnen`}
        onPress={() => router.push(`/job/${job.id}`)}
        style={styles.body}
      >
        <View style={styles.headRow}>
          <View style={[styles.pill, { backgroundColor: accent + '22' }]}>
            <View style={[styles.dot, { backgroundColor: accent }]} />
            <Text style={{ color: accent, fontWeight: '700', fontSize: 12 }}>
              {rework ? 'NACHARBEIT · ' : ''}
              {running ? 'LÄUFT' : 'PAUSIERT'}
            </Text>
          </View>
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
      {!rework && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Nacharbeit zu ${name} starten`}
          onPress={() => void actions.startRework(job)}
          style={styles.reworkLink}
        >
          <Ionicons name="construct-outline" size={16} color={p.warning} />
          <Text style={{ color: p.warning, fontWeight: '600' }}>Nacharbeit starten</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  body: { gap: 4 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  dot: { width: 8, height: 8, borderRadius: 4 },
  title: { fontSize: 20, fontWeight: '700', marginTop: 4 },
  timeRow: { marginTop: spacing.sm },
  clock: { fontSize: 40, fontWeight: '300', fontVariant: ['tabular-nums'] },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  reworkLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
});
