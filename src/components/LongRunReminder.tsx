import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useData, useQuery } from '../data/DataProvider';
import { jobTitle, pauseAtError, runningSince } from '../domain/jobs';
import { formatTime } from '../domain/time';
import { DEFAULT_LONG_RUN_MINUTES } from '../domain/types';
import { useNow } from '../hooks/useNow';
import { appHidden, showNotification } from '../lib/notify';
import { radius, spacing, usePalette } from '../theme';
import { DateTimeField } from './DateTimeField';
import { Button } from './ui';

const MINUTE = 60_000;
const ACK_KEY = 'timetracker.longRunAck';

/** Bestätigung je Lauf: `key` = Auftrag + Beginn ohne Pause, `nextAt` = Laufzeit, ab der wieder erinnert wird. */
interface Ack {
  key: string;
  nextAtMs: number;
  notified?: number;
}

function loadAck(): Ack | null {
  try {
    const raw = globalThis.localStorage?.getItem(ACK_KEY);
    return raw ? (JSON.parse(raw) as Ack) : null;
  } catch {
    return null;
  }
}

function saveAck(ack: Ack): void {
  try {
    globalThis.localStorage?.setItem(ACK_KEY, JSON.stringify(ack));
  } catch {
    // ohne Speicher gilt die Bestätigung nur bis zum Neuladen
  }
}

/** „2:31“ */
function hm(ms: number): string {
  const m = Math.floor(ms / MINUTE);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Erinnerung, wenn der Timer lange ohne Pause läuft (Standard 2,5 h): Weiter, Stoppen oder „vergessen auszumachen“ –
 * dann endet die Zeit nachträglich vor 15/30/60 min bzw. zur gewählten Uhrzeit. Im Hintergrund zusätzlich als
 * Systembenachrichtigung (wenn erlaubt).
 */
export function LongRunReminder() {
  const p = usePalette();
  const { mutate } = useData();
  const now = useNow(30_000);
  const { data } = useQuery(async (r) => {
    const [settings, open] = await Promise.all([r.settings.get(), r.jobs.listOpen()]);
    const job = open.find((j) => j.status === 'running') ?? null;
    const entries = job ? (await r.entries.listInRange(Date.now() - 3 * 24 * 60 * MINUTE, Date.now() + MINUTE)).filter((e) => e.jobId === job.id) : [];
    return { settings, job, entries };
  });
  const [ack, setAck] = useState<Ack | null>(() => loadAck());
  const [custom, setCustom] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const notifiedRef = useRef<string | null>(null);

  const thresholdMs = (data?.settings.longRunMinutes ?? DEFAULT_LONG_RUN_MINUTES) * MINUTE;
  const job = data?.job ?? null;
  const since = job && data ? runningSince(data.entries, now) : null;
  const elapsed = since !== null ? now - since : 0;
  const key = job && since !== null ? `${job.id}:${since}` : null;
  const nextAtMs = ack && ack.key === key ? ack.nextAtMs : thresholdMs;
  const due = thresholdMs > 0 && key !== null && elapsed >= nextAtMs;

  // im Hintergrund einmal je Erinnerung als Systembenachrichtigung
  useEffect(() => {
    if (!due || !key || !job) return;
    const tag = `${key}:${nextAtMs}`;
    if (notifiedRef.current === tag || !appHidden()) return;
    notifiedRef.current = tag;
    void showNotification(`Timer läuft seit ${hm(elapsed)} ohne Pause`, `${jobTitle(job)} – weiter oder stoppen?`, `long-run-${job.id}`);
  }, [due, key, job, nextAtMs, elapsed]);

  if (!due || !job || since === null || !key) return null;

  const close = () => {
    setCustom(null);
    setError(null);
  };
  const keepGoing = () => {
    // nach „Weiter“ erst nach einer weiteren Schwelle wieder erinnern
    const next: Ack = { key, nextAtMs: elapsed + thresholdMs };
    saveAck(next);
    setAck(next);
    close();
  };
  const stop = async () => {
    await mutate((r) => r.jobs.pause(job.id));
    close();
  };
  const stoppedAt = async (at: number) => {
    const err = pauseAtError(data?.entries ?? [], at, Date.now());
    if (err) {
      setError(err);
      return;
    }
    try {
      await mutate((r) => r.jobs.pauseAt(job.id, at));
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const ago = [15, 30, 60].filter((m) => now - m * MINUTE > since);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={keepGoing}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: p.card }]} accessibilityRole="alert">
          <Text style={[styles.title, { color: p.text }]}>Timer läuft seit {hm(elapsed)} ohne Pause</Text>
          <Text style={{ color: p.muted }}>
            {jobTitle(job)} · seit {formatTime(since)} Uhr
          </Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Button title="Weiter" icon="play" variant="success" onPress={keepGoing} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Stoppen" icon="pause" variant="danger" onPress={() => void stop()} />
            </View>
          </View>

          <Text style={[styles.sub, { color: p.text }]}>Vergessen auszumachen? Aufgehört vor …</Text>
          <View style={styles.row}>
            {ago.map((m) => (
              <Pressable
                key={m}
                accessibilityRole="button"
                accessibilityLabel={`Aufgehört vor ${m} min`}
                onPress={() => void stoppedAt(now - m * MINUTE)}
                style={({ pressed }) => [styles.chip, { backgroundColor: p.track, opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={{ color: p.text, fontWeight: '600' }}>{m} min</Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={() => setCustom(custom === null ? Math.max(since + MINUTE, now - 30 * MINUTE) : null)}
              style={({ pressed }) => [styles.chip, { backgroundColor: p.track, opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={{ color: p.text, fontWeight: '600' }}>Uhrzeit wählen</Text>
            </Pressable>
          </View>
          {custom !== null && (
            <View style={{ gap: spacing.sm }}>
              <DateTimeField label="Aufgehört um" value={custom} onChange={setCustom} />
              <Button title={`Um ${formatTime(custom)} Uhr stoppen`} variant="warning" onPress={() => void stoppedAt(custom)} />
            </View>
          )}
          {error && <Text style={{ color: p.danger }}>{error}</Text>}
          <Text style={{ color: p.muted, fontSize: 12 }}>
            Die Zeit danach wird gelöscht, der Auftrag ist dann pausiert.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  sheet: { width: '100%', maxWidth: 440, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 20, fontWeight: '700' },
  sub: { fontWeight: '600', marginTop: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md },
});
