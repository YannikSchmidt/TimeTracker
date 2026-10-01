import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { DateTimeField } from '../../components/DateTimeField';
import {
  ArticleField,
  OrderField,
  QuantityField,
  parseQuantity,
  type ArticleFieldHandle,
} from '../../components/EntryFields';
import { DimensionPicker } from '../../components/ValuePicker';
import { Button, Card, Chip, SectionTitle } from '../../components/ui';
import { useData } from '../../data/DataProvider';
import { jobName, jobTimes, reworkOf } from '../../domain/jobs';
import { reworkReasons } from '../../domain/suggestions';
import { formatClock, formatDuration, formatTime } from '../../domain/time';
import type { Job } from '../../domain/types';
import { articleLabel, useArticles } from '../../hooks/useArticles';
import { useDimensions } from '../../hooks/useDimensions';
import { useJobActions } from '../../hooks/useJobActions';
import { useNow } from '../../hooks/useNow';
import { useWork } from '../../hooks/useWork';
import { radius, spacing, usePalette } from '../../theme';

const HOUR = 3_600_000;

/** Auftrag ansehen/bearbeiten (`/job/<id>`, nach Abschluss mit `?done=1`) oder nachtragen (`/job/new`). */
export default function JobScreen() {
  const p = usePalette();
  const { id, done } = useLocalSearchParams<{ id: string; done?: string }>();
  const isNew = id === 'new';
  const { mutate } = useData();
  const work = useWork();
  const dims = useDimensions();
  const articles = useArticles();
  const actions = useJobActions();
  const now = useNow(1000);
  const articleRef = useRef<ArticleFieldHandle>(null);
  const job = isNew ? undefined : work.all.jobsById.get(id);
  const readOnly = !!job && !work.isOwn(job);

  // Formularzustand
  const [loaded, setLoaded] = useState(isNew);
  const [orderNo, setOrderNo] = useState('');
  const [articleId, setArticleId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [valueIds, setValueIds] = useState<string[]>([]);
  const [startAt, setStartAt] = useState(() => Date.now() - HOUR);
  const [endAt, setEndAt] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (job && !loaded) {
    setOrderNo(job.orderNo ?? '');
    setArticleId(job.articleId);
    setQuantity(job.quantity == null ? '' : String(job.quantity));
    setNote(job.note);
    setReason(job.reworkReason ?? '');
    setValueIds(job.valueIds);
    setLoaded(true);
  }
  if (!loaded) return null;
  if (!isNew && !job) return null;

  const fields = {
    orderNo,
    articleId,
    quantity: parseQuantity(quantity),
    note: note.trim(),
    valueIds,
    reworkReason: job?.kind === 'rework' ? reason : null,
  };

  const save = async () => {
    setError(null);
    if (!((await articleRef.current?.commit()) ?? true)) return;
    try {
      if (isNew) {
        await mutate((r) => r.jobs.createManual(fields, startAt, endAt));
        router.back();
      } else {
        await mutate((r) => r.jobs.update(id, fields));
        setSaved(true);
      }
    } catch (e) {
      setError(`Speichern nicht möglich: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const remove = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await mutate((r) => r.jobs.remove(id));
    router.back();
  };

  const entries = job ? (work.all.entriesOf.get(job.id) ?? []) : [];
  const times = job ? jobTimes(job, entries, now) : null;
  const reworks = job ? reworkOf(job.id, work.all.jobs, work.all.entries, now) : [];
  const reworkMs = reworks.reduce((s, r) => s + r.workMs, 0);
  const parent = job?.parentJobId ? work.all.jobsById.get(job.parentJobId) : undefined;
  const isRework = job?.kind === 'rework';
  const articleOf = (j: { articleId: string | null }) => (j.articleId ? articles.byId.get(j.articleId) : undefined);

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isNew ? 'Auftrag nachtragen' : job ? jobName(job, articleOf(job)) : 'Auftrag' }} />

      {job && times && (
        <Card style={[styles.summary, done === '1' && { borderColor: p.success, borderWidth: 2 }]}>
          {done === '1' && <Text style={[styles.doneBadge, { color: p.success }]}>✓ Auftrag abgeschlossen</Text>}
          <Text style={{ color: p.muted }}>Arbeitszeit</Text>
          <Text style={[styles.bigTime, { color: p.text }]}>{formatClock(times.workMs)}</Text>
          <View style={styles.statRow}>
            <Stat label="Gesamtzeit" value={formatDuration(times.totalMs)} hint="erster Start bis Abschluss" />
            <Stat label="Pausen" value={formatDuration(times.pausedMs)} />
            {!isRework && <Stat label="Nacharbeit" value={reworkMs > 0 ? formatDuration(reworkMs) : '–'} color={reworkMs > 0 ? p.warning : undefined} />}
          </View>
          <Text style={{ color: p.muted, fontSize: 12 }}>
            {formatTime(times.firstStart)} – {job.finishedAt ? formatTime(job.finishedAt) : job.status === 'running' ? 'läuft' : 'pausiert'}
            {parent ? `  ·  Nacharbeit zu ${jobName(parent, articleOf(parent))}` : ''}
          </Text>
          {readOnly ? (
            <Text style={[styles.owner, { color: p.muted, backgroundColor: p.track }]}>
              Auftrag von {job.createdBy ? work.nameOf(job.createdBy) : 'einer anderen Person'} – nur lesbar
            </Text>
          ) : (
            <JobButtons job={job} actions={actions} onReopen={() => mutate((r) => r.jobs.reopen(job.id))} />
          )}
          {done === '1' && <Button title="Fertig" variant="secondary" onPress={() => router.back()} />}
        </Card>
      )}

      {reworks.length > 0 && (
        <Card style={{ gap: spacing.sm }}>
          <SectionTitle>Nacharbeit</SectionTitle>
          {reworks.map((r) => (
            <Pressable key={r.job.id} onPress={() => router.push(`/job/${r.job.id}`)} style={styles.listRow}>
              <Text style={{ color: p.text, flex: 1 }} numberOfLines={1}>
                {r.job.reworkReason ?? (r.job.status === 'done' ? 'ohne Grund' : 'läuft noch')}
              </Text>
              <Text style={{ color: p.warning, fontWeight: '700' }}>{formatDuration(r.workMs)}</Text>
            </Pressable>
          ))}
        </Card>
      )}

      {readOnly && job && (
        <Card style={{ gap: spacing.sm }}>
          <InfoRow label="Auftrag" value={job.orderNo ?? '–'} />
          <InfoRow label="Artikel" value={articleOf(job) ? articleLabel(articleOf(job)!) : '–'} />
          {articleOf(job)?.device ? <InfoRow label="Endgerät" value={articleOf(job)!.device} /> : null}
          {!isRework && <InfoRow label="Stückzahl" value={job.quantity == null ? '–' : String(job.quantity)} />}
          {isRework && <InfoRow label="Grund" value={job.reworkReason ?? '–'} />}
          {job.note ? <InfoRow label="Notiz" value={job.note} /> : null}
        </Card>
      )}

      {!readOnly && (
        <>
          <Card style={{ gap: spacing.lg }}>
            {isNew && (
              <View>
                <DateTimeField label="Start" value={startAt} onChange={setStartAt} />
                <DateTimeField label="Ende" value={endAt} onChange={setEndAt} />
              </View>
            )}
            <View>
              <SectionTitle>Auftrag</SectionTitle>
              <OrderField value={orderNo} onChange={setOrderNo} />
            </View>
            <View>
              <SectionTitle>Artikel</SectionTitle>
              <ArticleField ref={articleRef} articles={articles} value={articleId} onChange={setArticleId} />
            </View>
            {!isRework && (
              <View>
                <SectionTitle>Stückzahl</SectionTitle>
                <QuantityField value={quantity} onChange={setQuantity} />
              </View>
            )}
            {isRework && (
              <View style={{ gap: spacing.sm }}>
                <SectionTitle>Grund der Nacharbeit</SectionTitle>
                <TextInput
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Grund"
                  placeholderTextColor={p.muted}
                  accessibilityLabel="Grund der Nacharbeit"
                  style={[styles.input, { color: p.text, borderColor: p.border }]}
                />
                <View style={styles.chips}>
                  {reworkReasons(work.all.jobs).map((s) => (
                    <Chip key={s} label={s} selected={s === reason.trim()} onPress={() => setReason(s)} />
                  ))}
                </View>
              </View>
            )}
            <DimensionPicker dims={dims} selected={valueIds} onChange={setValueIds} />
            <View>
              <SectionTitle>Notiz</SectionTitle>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Optional"
                placeholderTextColor={p.muted}
                multiline
                accessibilityLabel="Notiz"
                style={[styles.input, { color: p.text, borderColor: p.border, minHeight: 60 }]}
              />
            </View>
          </Card>

          {error && <Text style={{ color: p.danger }}>{error}</Text>}
          {saved && <Text style={{ color: p.success }}>Gespeichert.</Text>}
          <Button title={isNew ? 'Nachtragen' : 'Änderungen speichern'} icon="checkmark" onPress={() => void save()} disabled={isNew && endAt <= startAt} />
        </>
      )}

      {job && entries.length > 0 && (
        <Card style={{ gap: spacing.xs }}>
          <SectionTitle>Arbeitsabschnitte ({entries.length})</SectionTitle>
          {entries.map((e) => (
            <Pressable
              key={e.id}
              accessibilityRole="button"
              disabled={readOnly}
              onPress={() => router.push(`/entry/${e.id}`)}
              style={styles.listRow}
            >
              <Text style={{ color: p.text, flex: 1 }}>
                {formatTime(e.startAt)} – {e.endAt ? formatTime(e.endAt) : 'läuft'}
              </Text>
              <Text style={{ color: p.muted }}>{formatDuration((e.endAt ?? now) - e.startAt)}</Text>
            </Pressable>
          ))}
        </Card>
      )}

      {job && !readOnly && (
        <View style={{ gap: spacing.sm }}>
          <Button
            title={confirmDelete ? 'Wirklich löschen?' : 'Auftrag löschen'}
            icon="trash-outline"
            variant={confirmDelete ? 'danger' : 'secondary'}
            onPress={() => void remove()}
          />
          {confirmDelete && (
            <>
              <Text style={{ color: p.muted, fontSize: 12 }}>Löscht auch alle Abschnitte und Nacharbeiten dieses Auftrags.</Text>
              <Button title="Abbrechen" variant="secondary" onPress={() => setConfirmDelete(false)} />
            </>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function JobButtons({
  job,
  actions,
  onReopen,
}: {
  job: Job;
  actions: ReturnType<typeof useJobActions>;
  onReopen: () => void;
}) {
  if (job.status === 'done') {
    return (
      <View style={styles.buttonRow}>
        {job.kind === 'order' && (
          <View style={{ flex: 1 }}>
            <Button title="Nacharbeit" icon="construct-outline" variant="warning" onPress={() => void actions.startRework(job)} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Button title="Wieder öffnen" icon="refresh" variant="secondary" onPress={onReopen} />
        </View>
      </View>
    );
  }
  return (
    <View style={styles.buttonRow}>
      <View style={{ flex: 1 }}>
        {job.status === 'running' ? (
          <Button title="Pause" icon="pause" variant="secondary" onPress={() => void actions.pause(job)} />
        ) : (
          <Button title="Weiter" icon="play" variant="success" onPress={() => void actions.resume(job)} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Button title="Fertig" icon="checkmark" variant={job.kind === 'rework' ? 'warning' : 'primary'} onPress={() => void actions.finish(job)} />
      </View>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const p = usePalette();
  return (
    <View style={styles.listRow}>
      <Text style={{ color: p.muted, width: 80 }}>{label}</Text>
      <Text style={{ color: p.text, fontWeight: '600', flex: 1 }}>{value}</Text>
    </View>
  );
}

function Stat({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  const p = usePalette();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: p.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: color ?? p.text, fontWeight: '700', fontSize: 16 }}>{value}</Text>
      {hint && <Text style={{ color: p.muted, fontSize: 10 }}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl * 2 },
  summary: { gap: spacing.sm },
  doneBadge: { fontWeight: '800', fontSize: 16 },
  owner: { padding: spacing.sm, borderRadius: radius.sm, overflow: 'hidden', marginTop: spacing.sm },
  bigTime: { fontSize: 52, fontWeight: '300', fontVariant: ['tabular-nums'] },
  statRow: { flexDirection: 'row', gap: spacing.md },
  buttonRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  input: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, fontSize: 16 },
});
