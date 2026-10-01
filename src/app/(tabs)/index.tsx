import { Ionicons } from '@expo/vector-icons';
import { addDays, startOfDay } from 'date-fns';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { JobCard } from '../../components/JobCard';
import { JobRow } from '../../components/JobRow';
import { SyncBadge, SyncSetupHint } from '../../components/SyncBadge';
import { Empty, SectionTitle } from '../../components/ui';
import { reworkOf } from '../../domain/jobs';
import { totalMs } from '../../domain/stats';
import { formatDuration } from '../../domain/time';
import { useArticles } from '../../hooks/useArticles';
import { useJobActions } from '../../hooks/useJobActions';
import { useNow } from '../../hooks/useNow';
import { useWork } from '../../hooks/useWork';
import { radius, spacing, usePalette } from '../../theme';
import { sortOpenJobs } from '../../repositories/types';

export default function TimerScreen() {
  const p = usePalette();
  const work = useWork();
  const articles = useArticles();
  const actions = useJobActions();
  const now = useNow(1000);

  const dayStart = startOfDay(now).getTime();
  const dayEnd = addDays(dayStart, 1).getTime();

  const open = sortOpenJobs(work.jobs.filter((j) => j.status !== 'done'));
  const doneToday = work.jobs
    .filter((j) => j.status === 'done' && j.kind === 'order' && (j.finishedAt ?? 0) >= dayStart)
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
  const todayMs = totalMs(work.segments, { start: dayStart, end: dayEnd }, now);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Neuer Auftrag"
        onPress={() => router.push('/start')}
        style={({ pressed }) => [styles.newButton, { backgroundColor: p.primary, opacity: pressed ? 0.85 : 1 }]}
      >
        <Ionicons name="scan" size={30} color={p.onPrimary} />
        <View>
          <Text style={[styles.newTitle, { color: p.onPrimary }]}>Neuer Auftrag</Text>
          <Text style={{ color: p.onPrimary, opacity: 0.85 }}>Scannen und los</Text>
        </View>
      </Pressable>

      <SyncSetupHint />
      <SyncBadge />
      <Text style={{ color: p.muted, textAlign: 'center' }}>
        Heute gearbeitet: <Text style={{ color: p.text, fontWeight: '700' }}>{formatDuration(todayMs)}</Text>
      </Text>

      <View style={{ gap: spacing.md }}>
        <SectionTitle>Offene Aufträge {open.length > 0 ? `(${open.length})` : ''}</SectionTitle>
        {!work.loaded ? (
          <Empty text="Lädt …" />
        ) : open.length === 0 ? (
          <Empty text="Kein offener Auftrag. Tippe auf „Neuer Auftrag“." />
        ) : (
          open.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              entries={work.entriesOf.get(job.id) ?? []}
              article={job.articleId ? articles.byId.get(job.articleId) : undefined}
              now={now}
            />
          ))
        )}
      </View>

      {doneToday.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          <SectionTitle>Heute abgeschlossen</SectionTitle>
          {doneToday.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              entries={work.entriesOf.get(job.id) ?? []}
              article={job.articleId ? articles.byId.get(job.articleId) : undefined}
              reworkMs={reworkOf(job.id, work.jobs, work.entries, now).reduce((s, r) => s + r.workMs, 0)}
              now={now}
              right={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Nacharbeit zu Auftrag ${job.orderNo ?? ''} starten`}
                  hitSlop={8}
                  onPress={() => void actions.startRework(job)}
                  style={[styles.reworkButton, { borderColor: p.warning }]}
                >
                  <Ionicons name="construct-outline" size={18} color={p.warning} />
                </Pressable>
              }
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl * 2 },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
    borderRadius: radius.lg,
  },
  newTitle: { fontSize: 22, fontWeight: '800' },
  reworkButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
