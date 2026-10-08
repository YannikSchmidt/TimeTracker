import { Ionicons } from '@expo/vector-icons';
import { startOfDay } from 'date-fns';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { JobCard } from '../../components/JobCard';
import { JobRow } from '../../components/JobRow';
import { SyncBadge, SyncSetupHint } from '../../components/SyncBadge';
import { UpdateBanner } from '../../components/UpdateBanner';
import { Empty, SectionTitle } from '../../components/ui';
import { stepChoices } from '../../domain/flows';
import { jobName, reworkOf } from '../../domain/jobs';
import { orderArticle, sameOrder } from '../../domain/targets';
import { useArticles } from '../../hooks/useArticles';
import { useGroups } from '../../hooks/useGroups';
import { useJobActions } from '../../hooks/useJobActions';
import { useNow } from '../../hooks/useNow';
import { useWork } from '../../hooks/useWork';
import { radius, spacing, usePalette } from '../../theme';
import { sortOpenJobs } from '../../repositories/types';

export default function TimerScreen() {
  const p = usePalette();
  const work = useWork();
  const articles = useArticles();
  const groups = useGroups();
  const actions = useJobActions();
  const now = useNow(1000);

  const dayStart = startOfDay(now).getTime();

  // Schon verwendete Arbeitsschritte je Artikel (nur Namen, keine Zeiten) – Auswahl im Schritt-Knopf
  const usedSteps = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const j of work.all.jobs) {
      const key = `${j.articleId ?? `job:${j.id}`}|${j.section === 'display' ? 'display' : ''}`;
      const list = map.get(key) ?? [];
      list.push(...(work.all.entriesOf.get(j.id) ?? []).filter((e) => !e.deletedAt && e.step).map((e) => e.step!));
      if (j.currentStep) list.push(j.currentStep);
      map.set(key, list);
    }
    return map;
  }, [work.all]);

  const open = sortOpenJobs(work.jobs.filter((j) => j.status !== 'done'));
  // Nacharbeit zu einem offenen Auftrag steht in dessen Kachel; sonst als eigene Kachel (gleiche Farbe)
  const openIds = new Set(open.map((j) => j.id));
  const nestedIn = (j: (typeof open)[number]) => (j.kind === 'rework' && j.parentJobId && openIds.has(j.parentJobId) ? j.parentJobId : null);
  const cards = open
    .filter((j) => !nestedIn(j))
    .map((job) => ({ job, reworks: open.filter((r) => nestedIn(r) === job.id) }))
    .sort((a, b) => Number([b.job, ...b.reworks].some((j) => j.status === 'running')) - Number([a.job, ...a.reworks].some((j) => j.status === 'running')));
  const doneToday = work.jobs
    .filter((j) => j.status === 'done' && j.kind === 'order' && (j.finishedAt ?? 0) >= dayStart)
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));

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

      <UpdateBanner />
      <SyncSetupHint />
      <SyncBadge />

      <View style={{ gap: spacing.md }}>
        <SectionTitle>Offene Aufträge {cards.length > 0 ? `(${cards.length})` : ''}</SectionTitle>
        {!work.loaded ? (
          <Empty text="Lädt …" />
        ) : open.length === 0 ? (
          <Empty text="Kein offener Auftrag. Tippe auf „Neuer Auftrag“." />
        ) : (
          cards.map(({ job, reworks }) => (
            <JobCard
              key={job.id}
              job={job}
              entries={work.entriesOf.get(job.id) ?? []}
              article={job.articleId ? articles.byId.get(job.articleId) : undefined}
              reworks={reworks.map((r) => ({ job: r, entries: work.entriesOf.get(r.id) ?? [] }))}
              steps={groups.flowOf(job.articleId ? articles.byId.get(job.articleId) : undefined, job.section ?? null).steps}
              stepChoices={stepChoices(
                groups.flowOf(job.articleId ? articles.byId.get(job.articleId) : undefined, job.section ?? null).steps,
                usedSteps.get(`${job.articleId ?? `job:${job.id}`}|${job.section === 'display' ? 'display' : ''}`) ?? [],
              )}
              partners={work.all.jobs
                .filter((j) => j.id !== job.id && !work.isOwn(j) && sameOrder(job, j))
                .map((j) => ({ job: j, entries: work.all.entriesOf.get(j.id) ?? [], name: work.nameOf(j.createdBy) }))}
              targetArticle={orderArticle(
                [job, ...work.all.jobs.filter((j) => j.id !== job.id && !work.isOwn(j) && sameOrder(job, j))],
                articles.byId,
              )}
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
                  accessibilityLabel={`Nacharbeit zu ${jobName(job, job.articleId ? articles.byId.get(job.articleId) : null)} starten`}
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

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/feedback')}
        style={styles.feedbackLink}
      >
        <Ionicons name="bulb-outline" size={16} color={p.muted} />
        <Text style={{ color: p.muted }}>Verbesserung vorschlagen</Text>
      </Pressable>
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
  feedbackLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.sm },
  reworkButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
