import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { jobName, jobTimes } from '../domain/jobs';
import { entryMs, SECTION_SHORT, timeSinceStepChange } from '../domain/flows';
import { compareShare, stepTargetMs } from '../domain/targets';
import { formatClock, formatDuration } from '../domain/time';
import type { Article, Entry, Job } from '../domain/types';
import { articleDetails } from '../hooks/useArticles';
import { useJobActions } from '../hooks/useJobActions';
import { orderColor, radius, spacing, usePalette } from '../theme';
import { StepMenu } from './StepMenu';
import { StepPicker } from './StepPicker';
import { Button } from './ui';
import { WorkersStepper } from './WorkersStepper';

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
  partners = [],
  steps = [],
  stepChoices = steps,
  targetArticle = article,
  now,
}: {
  job: Job;
  entries: Entry[];
  article?: Article;
  /** offene Nacharbeiten zu diesem Auftrag */
  reworks?: SubJob[];
  /** Timer anderer Personen am selben Auftrag (die Vorgabe wird im Verhältnis der Zeit aufgeteilt) */
  partners?: (SubJob & { name: string })[];
  /** Ablauf des Artikels (Arbeitsschritte in Reihenfolge) */
  steps?: string[];
  /** Auswahl im Schritt-Knopf: Ablauf + für den Artikel schon verwendete Schritte */
  stepChoices?: string[];
  /** Artikel mit den Vorgabezeiten (eigener, sonst der eines Kollegen am selben Auftrag) */
  targetArticle?: Article;
  now: number;
}) {
  const p = usePalette();
  const actions = useJobActions();
  const [picking, setPicking] = useState(false);
  const [stepMenu, setStepMenu] = useState(false);
  const t = jobTimes(job, entries, now);
  const running = job.status === 'running';
  const rework = job.kind === 'rework';
  const anyRunning = running || reworks.some((r) => r.job.status === 'running');
  const color = orderColor(job.orderNo) ?? p.muted;
  const state = rework ? p.warning : running ? p.success : p.muted;
  const name = jobName(job, article);
  const step = job.kind === 'order' ? job.currentStep : null;
  const stepIndex = step ? steps.indexOf(step) : -1;
  const next = !job.onlyStep && stepIndex >= 0 ? (steps[stepIndex + 1] ?? null) : null;
  const cmp = job.kind === 'order' ? compareShare([{ job, entries }, ...partners], new Set([job.id]), targetArticle, steps, now) : null;
  const workers = job.workers ?? 1;
  const personMs = entries.filter((e) => !e.deletedAt).reduce((s, e) => s + entryMs(e, now, true), 0);
  const stepTarget = step ? stepTargetMs(targetArticle, step, job.quantity) : null;
  const stepTime = step ? entries.filter((e) => e.step === step && !e.deletedAt).reduce((s, e) => s + ((e.endAt ?? now) - e.startAt), 0) : 0;
  const otherStepsMs = entries.filter((e) => e.step && e.step !== step && !e.deletedAt).reduce((s, e) => s + ((e.endAt ?? now) - e.startAt), 0);
  // Schritt beendet, nächster noch nicht gewählt: die Zeit seitdem zählt zum nächsten Schritt
  const endedSteps = job.kind === 'order' && !step && entries.some((e) => e.step && !e.deletedAt);
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
            {job.kind === 'order' && job.section ? (
              <View style={[styles.pill, { backgroundColor: p.primary + '1f' }]}>
                <Text style={{ color: p.primary, fontWeight: '700', fontSize: 12 }}>{SECTION_SHORT[job.section].toUpperCase()}</Text>
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
            <Text style={{ color: p.muted, fontSize: 12 }}>
              Arbeitszeit · gesamt {formatDuration(t.totalMs)}
              {personMs !== t.workMs ? ` · Personenzeit ${formatDuration(personMs)}` : ''}
              {cmp?.targetMs ? (
                <Text style={{ color: cmp.actualMs > cmp.targetMs ? p.danger : p.success, fontWeight: '600' }}>
                  {`  ·  Vorgabe ${formatDuration(cmp.targetMs)}`}
                </Text>
              ) : null}
            </Text>
          </View>
        </Pressable>
        {job.kind === 'order' && (
          <View style={styles.peopleRow}>
            <WorkersStepper compact value={workers} onChange={(n) => void actions.setWorkers(job, n)} />
          </View>
        )}
        {partners.length > 0 && (
          <Text style={{ color: p.muted, fontSize: 12 }} numberOfLines={2}>
            <Ionicons name="people-outline" size={13} color={p.muted} /> Auch am Auftrag:{' '}
            {partners.map((x) => `${x.name}${x.job.status === 'running' ? ' (läuft)' : x.job.status === 'done' ? ' (fertig)' : ''}`).join(', ')}
            {cmp?.targetMs ? ' – Vorgabe wird nach geleisteter Zeit aufgeteilt' : ''}
          </Text>
        )}
        {!step && endedSteps && (
          <View style={[styles.step, { backgroundColor: color + '0d', borderColor: color + '55' }]}>
            <Text style={{ color: p.muted, fontSize: 12 }}>Kein Schritt aktiv – seit {formatClock(timeSinceStepChange(entries, null, now).ms)}</Text>
            <Button
              title="Nächster Schritt"
              icon="list"
              onPress={() => setPicking(true)}
              accessibilityLabel={`Nächsten Schritt für ${name} wählen`}
            />
          </View>
        )}
        {step && (
          <View style={[styles.step, { backgroundColor: color + '14', borderColor: color + '55' }]}>
            {/* Name und Schritt-Uhr antippen → Menü zum Korrigieren */}
            <Pressable accessibilityRole="button" accessibilityLabel={`Schritt ${step} bearbeiten`} onPress={() => setStepMenu(true)} style={{ gap: 2 }}>
              <Text style={{ color: p.muted, fontSize: 12 }}>
                {job.onlyStep ? 'Einzelschritt (nicht der ganze Ablauf)' : stepIndex >= 0 ? `Schritt ${stepIndex + 1} von ${steps.length}` : 'Schritt'}
                {'  ·  antippen zum Korrigieren'}
              </Text>
              <View style={styles.stepRow}>
                <Text style={{ color: p.text, fontSize: 18, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                  {step}
                </Text>
                <Text style={{ color: stepTarget && stepTime > stepTarget ? p.danger : p.muted, fontVariant: ['tabular-nums'] }}>
                  {formatClock(stepTime)}
                  {stepTarget ? ` / ${formatDuration(stepTarget)}` : ''}
                </Text>
                <Ionicons name="create-outline" size={18} color={p.muted} />
              </View>
            </Pressable>
            {next ? (
              <Button
                title={`${step} fertig → ${next}`}
                icon="checkmark-done"
                variant="success"
                onPress={() => void actions.nextStep(job, next)}
                accessibilityLabel={`${step} fertig, weiter mit ${next}`}
              />
            ) : (
              <Button title="Schritt beendet" icon="checkmark-done" variant="secondary" onPress={() => void actions.endStep(job)} accessibilityLabel={`${step} beendet`} />
            )}
          </View>
        )}
        {step && (
          <StepMenu
            visible={stepMenu}
            step={step}
            stepMs={stepTime}
            workMs={t.workMs}
            otherStepsMs={otherStepsMs}
            onClose={() => setStepMenu(false)}
            onEnd={() => {
              setStepMenu(false);
              void actions.endStep(job);
            }}
            onAssignAll={() => {
              setStepMenu(false);
              void actions.assignAllToStep(job, step);
            }}
            onClear={() => {
              setStepMenu(false);
              void actions.clearStep(job, step);
            }}
          />
        )}
        <View style={styles.buttons}>
          <View style={{ flex: 1.5 }}>
            {running ? (
              <Button title="Pause" icon="pause" variant="secondary" size="large" onPress={() => void actions.pause(job)} accessibilityLabel={`${name} pausieren`} />
            ) : (
              <Button title="Weiter" icon="play" variant="success" size="large" onPress={() => void actions.resume(job)} accessibilityLabel={`${name} fortsetzen`} />
            )}
          </View>
          {job.kind === 'order' && (
            <View style={{ flex: 1.4 }}>
              <Button title="Schritt" icon="list" variant="secondary" size="large" onPress={() => setPicking(true)} accessibilityLabel={`Arbeitsschritt für ${name} wählen`} />
            </View>
          )}
          <View style={{ flex: 1.4 }}>
            <Button title="Fertig" icon="checkmark" variant={rework ? 'warning' : 'primary'} size="large" onPress={() => void actions.finish(job)} accessibilityLabel={`${name} beenden`} />
          </View>
        </View>

        {job.kind === 'order' && (
          <StepPicker
            visible={picking}
            title={`Arbeitsschritt · ${name}`}
            current={step}
            choices={stepChoices}
            sinceMs={timeSinceStepChange(entries, job.currentStep, now).ms}
            autoTakeOver={!step && endedSteps}
            flowSteps={steps}
            canHide={!!article}
            onRename={(from, to) => void actions.renameStep(job, article, from, to)}
            onHide={(s) => article && void actions.hideStep(job, article, s)}
            onClose={() => setPicking(false)}
            onPick={(s, takeOver) => {
              setPicking(false);
              void (takeOver ? actions.takeOverStep(job, s, article) : actions.switchStep(job, s, article));
            }}
          />
        )}

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
  step: { borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, gap: spacing.xs },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  peopleRow: { flexDirection: 'row', alignItems: 'center' },
  reworkLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
});
