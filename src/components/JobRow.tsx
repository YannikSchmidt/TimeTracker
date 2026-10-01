import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { jobName, jobTimes } from '../domain/jobs';
import { formatDuration, formatTime } from '../domain/time';
import type { Article, Entry, Job } from '../domain/types';
import { articleDetails } from '../hooks/useArticles';
import { spacing, usePalette } from '../theme';

/** Kompakte Zeile für Verlauf/Abgeschlossen: Arbeitszeit fett, Gesamtzeit klein. */
export function JobRow({
  job,
  entries,
  article,
  reworkMs = 0,
  now,
  right,
  owner,
}: {
  job: Job;
  entries: Entry[];
  article?: Article;
  /** Summe der Nacharbeit zu diesem Auftrag */
  reworkMs?: number;
  now: number;
  right?: ReactNode;
  /** Besitzer anzeigen (Team-Ansicht) */
  owner?: string | null;
}) {
  const p = usePalette();
  const t = jobTimes(job, entries, now);
  const rework = job.kind === 'rework';
  const open = job.status !== 'done';
  const details = [
    ...(article ? articleDetails(article) : []),
    job.quantity != null ? `${job.quantity} Stk` : '',
    rework && job.reworkReason ? `Grund: ${job.reworkReason}` : '',
  ].filter(Boolean);
  if (owner) details.unshift(owner);
  const timeRange = `${formatTime(t.firstStart)} – ${open ? (job.status === 'running' ? 'läuft' : 'pausiert') : formatTime(job.finishedAt!)}`;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/job/${job.id}`)}
      style={({ pressed }) => [styles.row, { backgroundColor: p.card, opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={[styles.bar, { backgroundColor: rework ? p.warning : open ? p.success : p.primary }]} />
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text style={{ color: p.text, fontWeight: '600' }} numberOfLines={1}>
          {jobName(job, article)}
        </Text>
        <Text style={{ color: p.muted, fontSize: 13 }} numberOfLines={1}>
          {[timeRange, ...details].join('  ·  ')}
        </Text>
        {reworkMs > 0 && (
          <Text style={{ color: p.warning, fontSize: 12, fontWeight: '600' }}>+ Nacharbeit {formatDuration(reworkMs)}</Text>
        )}
      </View>
      <View style={styles.times}>
        <Text style={[styles.work, { color: open ? p.success : p.text }]}>{formatDuration(t.workMs)}</Text>
        <Text style={{ color: p.muted, fontSize: 11 }}>gesamt {formatDuration(t.totalMs)}</Text>
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingRight: spacing.md,
    borderRadius: 12,
    overflow: 'hidden',
  },
  bar: { width: 4, alignSelf: 'stretch', borderRadius: 2, marginLeft: spacing.sm },
  times: { alignItems: 'flex-end' },
  work: { fontWeight: '800', fontSize: 16, fontVariant: ['tabular-nums'] },
});
