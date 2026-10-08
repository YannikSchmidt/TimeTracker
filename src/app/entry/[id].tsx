import { format } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { DateTimeField } from '../../components/DateTimeField';
import { DeleteAction } from '../../components/DeleteAction';
import { Button, Card, Chip, SectionTitle } from '../../components/ui';
import { useData, useQuery } from '../../data/DataProvider';
import { stepChoices } from '../../domain/flows';
import { hiddenStepsFor } from '../../domain/targets';
import { formatDuration, formatTime } from '../../domain/time';
import { useArticles } from '../../hooks/useArticles';
import { useGroups } from '../../hooks/useGroups';
import { usePermissions } from '../../hooks/usePermissions';
import { useWork } from '../../hooks/useWork';
import { radius, spacing, usePalette } from '../../theme';

/** Einen Arbeitsabschnitt korrigieren (Start, Ende, Arbeitsschritt) oder löschen. */
export default function EntryScreen() {
  const p = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { mutate } = useData();
  const perms = usePermissions();
  const { data: entry } = useQuery((r) => r.entries.get(id), [id]);
  const work = useWork();
  const articles = useArticles();
  const groups = useGroups();

  const [startAt, setStartAt] = useState(0);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [otherStep, setOtherStep] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (entry && !loaded) {
    setStartAt(entry.startAt);
    setEndAt(entry.endAt);
    setStep(entry.step ?? null);
    setLoaded(true);
  }
  if (!loaded) return null;

  const running = endAt === null;
  // Auswahl wie beim Schritt-Knopf: Ablauf des Artikels/Teils und bisher verwendete Schritte
  const job = entry ? work.all.jobsById.get(entry.jobId) : undefined;
  const article = job?.articleId ? articles.byId.get(job.articleId) : undefined;
  const sameKind = (j: { articleId: string | null; section?: string | null; id: string }) =>
    job && (job.articleId ? j.articleId === job.articleId && (j.section === 'display') === (job.section === 'display') : j.id === job.id);
  const used = work.all.jobs.filter((j) => sameKind(j)).flatMap((j) => (work.all.entriesOf.get(j.id) ?? []).map((e) => e.step));
  const choices = stepChoices(groups.flowOf(article, job?.section ?? null).steps, used, hiddenStepsFor(article, job?.section), entry?.step ?? null);
  const invalid = !running && endAt <= startAt;

  const save = async () => {
    try {
      await mutate((r) => r.entries.update(id, { startAt, endAt, step }));
      router.back();
    } catch (e) {
      setError(`Speichern nicht möglich: ${e instanceof Error ? e.message : String(e)}`);
    }
  };


  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card>
        <DateTimeField label="Start" value={startAt} onChange={setStartAt} />
        {running ? (
          <Text style={{ color: p.success, paddingVertical: spacing.sm }}>Läuft gerade</Text>
        ) : (
          <DateTimeField label="Ende" value={endAt} onChange={setEndAt} />
        )}
        <Text style={[styles.duration, { color: invalid ? p.danger : p.muted }]}>
          {invalid ? 'Ende muss nach dem Start liegen' : running ? '' : `Dauer: ${formatDuration(endAt - startAt)}`}
        </Text>
      </Card>
      <Card style={{ gap: spacing.sm }}>
        <SectionTitle>Arbeitsschritt</SectionTitle>
        <View style={styles.chips}>
          {choices.map((s) => (
            <Chip
              key={s}
              label={s}
              selected={step === s}
              onPress={() => {
                setStep(s);
                setOtherStep('');
              }}
            />
          ))}
          <Chip label="ohne Schritt" selected={step === null} onPress={() => setStep(null)} />
        </View>
        <TextInput
          value={otherStep}
          onChangeText={(t) => {
            setOtherStep(t);
            setStep(t.trim() || (entry?.step ?? null));
          }}
          placeholder="Anderer Schritt …"
          placeholderTextColor={p.muted}
          accessibilityLabel="Anderer Arbeitsschritt"
          style={[styles.input, { color: p.text, borderColor: p.border }]}
        />
        <Text style={{ color: p.muted, fontSize: 12 }}>
          Auf welchem Schritt die Zeit dieses Abschnitts gebucht wird{running ? ' – der Timer läuft danach in diesem Schritt weiter' : ''}.
        </Text>
      </Card>
      {error && <Text style={{ color: p.danger }}>{error}</Text>}
      <Button title="Speichern" icon="checkmark" onPress={() => void save()} disabled={invalid} />
      <DeleteAction
        kind="entry"
        targetId={id}
        owner={perms.me}
        label={`Abschnitt ${formatTime(startAt)}${endAt ? ` – ${formatTime(endAt)}` : ''} am ${format(startAt, 'dd.MM.yyyy')}`}
        title="Abschnitt löschen"
        doDelete={(r) => r.entries.remove(id)}
        onDone={() => router.back()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
  duration: { marginTop: spacing.sm, textAlign: 'right' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 44, fontSize: 16 },
});
