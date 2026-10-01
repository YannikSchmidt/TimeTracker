import { format } from 'date-fns';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { SyncBadge } from '../../components/SyncBadge';
import { Button, Card, Chip, SectionTitle } from '../../components/ui';
import { useData, useQuery } from '../../data/DataProvider';
import { jobsToCsv } from '../../domain/export';
import type { Dimension } from '../../domain/types';
import { useDimensions, type DimensionsData } from '../../hooks/useDimensions';
import { pickTextFile, shareTextFile } from '../../lib/files';
import type { BackupData } from '../../repositories/types';
import { useTeam } from '../../sync/TeamContext';
import { radius, spacing, usePalette, VALUE_COLORS } from '../../theme';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export default function SettingsScreen() {
  const p = usePalette();
  const { mutate, repos } = useData();
  const dims = useDimensions();
  const { data: settings } = useQuery((r) => r.settings.get());
  const [hours, setHours] = useState('');
  const [newDimName, setNewDimName] = useState('');
  const [newDimMulti, setNewDimMulti] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const team = useTeam();

  const [hoursFor, setHoursFor] = useState<number | null>(null);
  if (settings && settings.weeklyTargetHours !== hoursFor) {
    setHoursFor(settings.weeklyTargetHours);
    setHours(String(settings.weeklyTargetHours).replace('.', ','));
  }
  const [qty, setQty] = useState('');
  const [qtyFor, setQtyFor] = useState<number | null>(null);
  if (settings && settings.defaultQuantity !== qtyFor) {
    setQtyFor(settings.defaultQuantity);
    setQty(String(settings.defaultQuantity));
  }

  const saveQty = () => {
    const value = Number.parseInt(qty, 10);
    if (Number.isInteger(value) && value >= 0) {
      void mutate((r) => r.settings.set({ defaultQuantity: value }));
    } else if (settings) {
      setQty(String(settings.defaultQuantity));
    }
  };

  const saveHours = () => {
    const value = Number(hours.replace(',', '.'));
    if (Number.isFinite(value) && value >= 0 && value <= 168) {
      void mutate((r) => r.settings.set({ weeklyTargetHours: value }));
    } else if (settings) {
      setHours(String(settings.weeklyTargetHours).replace('.', ','));
    }
  };

  const toggleWorkDay = (day: number) => {
    if (!settings) return;
    const workDays = settings.workDays.includes(day)
      ? settings.workDays.filter((d) => d !== day)
      : [...settings.workDays, day].sort((a, b) => a - b);
    void mutate((r) => r.settings.set({ workDays }));
  };

  const addDimension = async () => {
    const name = newDimName.trim();
    if (!name) return;
    await mutate((r) => r.dimensions.createDimension({ name, multi: newDimMulti }));
    setNewDimName('');
    setNewDimMulti(false);
  };

  const stamp = () => format(Date.now(), 'yyyy-MM-dd');

  const exportCsv = async () => {
    const [jobs, entries, articles] = await Promise.all([repos.jobs.listAll(), repos.entries.listAll(), repos.articles.list()]);
    // BOM, damit Excel Umlaute korrekt erkennt
    const csv = '\uFEFF' + jobsToCsv(jobs, entries, dims.dimensions, dims.values, articles, Date.now());
    setStatus(await shareTextFile(`auftraege-${stamp()}.csv`, csv, 'text/csv'));
  };

  const exportJson = async () => {
    const backup = await repos.exportBackup();
    setStatus(await shareTextFile(`timetracker-backup-${stamp()}.json`, JSON.stringify(backup, null, 2), 'application/json'));
  };

  const importJson = async () => {
    const text = await pickTextFile();
    if (text === null) return;
    try {
      const data = JSON.parse(text) as BackupData;
      await mutate((r) => r.importBackup(data));
      setStatus('Import abgeschlossen.');
    } catch (e) {
      setStatus(`Import fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <SectionTitle>Arbeitszeit</SectionTitle>
      <Card style={{ gap: spacing.md }}>
        <View style={styles.row}>
          <Text style={[styles.label, { color: p.text, flex: 1 }]}>Sollstunden pro Woche</Text>
          <TextInput
            value={hours}
            onChangeText={setHours}
            onBlur={saveHours}
            keyboardType="decimal-pad"
            style={[styles.smallInput, { color: p.text, borderColor: p.border }]}
          />
        </View>
        <Text style={{ color: p.muted }}>Arbeitstage</Text>
        <View style={styles.wrap}>
          {WEEKDAYS.map((label, i) => (
            <Chip key={label} label={label} selected={settings?.workDays.includes(i + 1)} onPress={() => toggleWorkDay(i + 1)} />
          ))}
        </View>
      </Card>

      <SectionTitle>Stückzahl</SectionTitle>
      <Card style={{ gap: spacing.sm }}>
        <View style={styles.row}>
          <Text style={[styles.label, { color: p.text, flex: 1 }]}>Standard-Stückzahl</Text>
          <TextInput
            value={qty}
            onChangeText={(t) => setQty(t.replace(/[^0-9]/g, ''))}
            onBlur={saveQty}
            keyboardType="number-pad"
            accessibilityLabel="Standard-Stückzahl"
            style={[styles.smallInput, { color: p.text, borderColor: p.border }]}
          />
        </View>
        <Text style={{ color: p.muted, fontSize: 12 }}>
          Wird beim Start vorgeschlagen. Hat ein Artikel schon Einträge, wird stattdessen seine häufigste Stückzahl vorgeschlagen.
        </Text>
      </Card>

      <SectionTitle>Merkmale</SectionTitle>
      <Text style={{ color: p.muted, marginTop: -spacing.sm }}>
        Aktive Merkmale erscheinen beim Timer und in der Statistik. Werte lange drücken zum Archivieren.
      </Text>
      {dims.dimensions.map((d) => (
        <DimensionCard key={d.id} dimension={d} dims={dims} />
      ))}
      <Card style={{ gap: spacing.md }}>
        <Text style={{ color: p.text, fontWeight: '600' }}>Eigenes Merkmal hinzufügen</Text>
        <TextInput
          value={newDimName}
          onChangeText={setNewDimName}
          placeholder="z.B. Standort"
          placeholderTextColor={p.muted}
          style={[styles.input, { color: p.text, borderColor: p.border }]}
        />
        <View style={styles.row}>
          <Text style={{ color: p.text }}>Mehrfachauswahl (wie Tags)</Text>
          <Switch value={newDimMulti} onValueChange={setNewDimMulti} />
        </View>
        <Button title="Hinzufügen" icon="add" variant="secondary" onPress={addDimension} disabled={!newDimName.trim()} />
      </Card>

      {team.available && (
        <>
          <SectionTitle>Team-Sync</SectionTitle>
          <Card style={{ gap: spacing.md }}>
            {team.connected ? (
              <>
                <Text style={{ color: p.text }}>
                  Verbunden als <Text style={{ fontWeight: '700' }}>{team.name ?? team.login}</Text> ({team.login}) mit{' '}
                  {team.repo}
                </Text>
                <SyncBadge />
                {team.others.length > 0 && (
                  <Text style={{ color: p.muted, fontSize: 12 }}>Im Team: {team.others.map((o) => o.login).join(', ')}</Text>
                )}
                <Button title="Jetzt synchronisieren" icon="sync-outline" variant="secondary" onPress={team.syncNow} />
                <Button
                  title={confirmLogout ? 'Wirklich abmelden?' : 'Dieses Gerät abmelden'}
                  icon="log-out-outline"
                  variant={confirmLogout ? 'danger' : 'secondary'}
                  onPress={() => {
                    if (!confirmLogout) return setConfirmLogout(true);
                    setConfirmLogout(false);
                    void team.disconnect();
                  }}
                />
                {confirmLogout && (
                  <Text style={{ color: p.muted, fontSize: 12 }}>
                    Token und Schlüssel werden von diesem Gerät gelöscht. Die Daten bleiben verschlüsselt im Daten-Repo.
                  </Text>
                )}
              </>
            ) : (
              <>
                <Text style={{ color: p.muted }}>
                  Nicht verbunden – die Daten liegen nur auf diesem Gerät.
                </Text>
                <Button title="Team-Sync einrichten" icon="cloud-outline" onPress={() => router.push('/connect')} />
              </>
            )}
          </Card>
        </>
      )}

      <SectionTitle>Daten</SectionTitle>
      <Card style={{ gap: spacing.md }}>
        <Button title="Als CSV exportieren (Excel)" icon="document-text-outline" variant="secondary" onPress={exportCsv} />
        <Button title="Backup exportieren (JSON)" icon="cloud-download-outline" variant="secondary" onPress={exportJson} />
        <Button title="Backup importieren" icon="cloud-upload-outline" variant="secondary" onPress={importJson} />
        {status && <Text style={{ color: p.text }}>{status}</Text>}
        <Text style={{ color: p.muted, fontSize: 12 }}>
          {team.connected
            ? 'Daten werden auf diesem Gerät gespeichert und verschlüsselt mit dem Team abgeglichen.'
            : Platform.OS === 'web'
              ? 'Alle Daten bleiben nur in diesem Browser gespeichert.'
              : 'Alle Daten werden nur lokal auf diesem Gerät gespeichert.'}
        </Text>
      </Card>
    </ScrollView>
  );
}

function DimensionCard({ dimension, dims }: { dimension: Dimension; dims: DimensionsData }) {
  const p = usePalette();
  const { mutate } = useData();
  const [open, setOpen] = useState(false);
  const values = dims.valuesOf(dimension.id, true);

  const cycleColor = (id: string, color: string) => {
    const next = VALUE_COLORS[(VALUE_COLORS.indexOf(color) + 1) % VALUE_COLORS.length];
    void mutate((r) => r.dimensions.updateValue(id, { color: next }));
  };

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={styles.row}>
        <Pressable style={{ flex: 1 }} onPress={() => setOpen((o) => !o)}>
          <Text style={[styles.label, { color: p.text }]}>{dimension.name}</Text>
          <Text style={{ color: p.muted, fontSize: 12 }}>
            {values.filter((v) => !v.archived).length} Werte{dimension.multi ? ' · Mehrfachauswahl' : ''} · {open ? 'zuklappen' : 'verwalten'}
          </Text>
        </Pressable>
        <Switch
          value={dimension.enabled}
          onValueChange={(enabled) => mutate((r) => r.dimensions.updateDimension(dimension.id, { enabled }))}
        />
      </View>
      {open && (
        <View style={styles.wrap}>
          {values.length === 0 && <Text style={{ color: p.muted }}>Noch keine Werte – beim Timer über „+ Neu“ anlegen.</Text>}
          {values.map((v) => (
            <Chip
              key={v.id}
              label={v.archived ? `${v.name} (archiviert)` : v.name}
              color={v.color}
              selected={!v.archived}
              onPress={() => cycleColor(v.id, v.color)}
              onLongPress={() => mutate((r) => r.dimensions.updateValue(v.id, { archived: !v.archived }))}
            />
          ))}
        </View>
      )}
      {open && values.length > 0 && (
        <Text style={{ color: p.muted, fontSize: 12 }}>Tippen: Farbe wechseln · Lange drücken: archivieren/wiederherstellen</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  label: { fontSize: 16, fontWeight: '600' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  smallInput: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 6, width: 80, textAlign: 'right', fontSize: 16 },
  input: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, fontSize: 16 },
});
