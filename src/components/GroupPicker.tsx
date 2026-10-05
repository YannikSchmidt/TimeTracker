import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { useData, useQuery } from '../data/DataProvider';
import { classifyCode } from '../domain/codes';
import { MAIN_GROUP_ID, MAIN_GROUP_LABEL } from '../domain/flows';
import { DEFAULT_SETTINGS, type MainGroup } from '../domain/types';
import { useGroups } from '../hooks/useGroups';
import { radius, spacing, usePalette } from '../theme';
import { Button, Chip, Segmented } from './ui';

/**
 * Gruppe eines Artikels: Hauptgruppe aus der Nummer (07… Gesamtgerät, 500000… Front) – nur ohne passende Nummer
 * wählbar – und Untergruppe (einmal eingegeben, danach als Vorschlag). Zeigt den daraus folgenden Ablauf.
 */
export function GroupPicker({ number, groupId, onChange }: { number: string; groupId: string | null; onChange: (groupId: string | null) => void }) {
  const p = usePalette();
  const { mutate } = useData();
  const groups = useGroups();
  const { data: settings } = useQuery((r) => r.settings.get());
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const kind = number.trim() ? classifyCode(number, settings?.codePatterns ?? DEFAULT_SETTINGS.codePatterns) : 'unknown';
  const fromNumber: MainGroup | null = kind === 'device' || kind === 'part' ? kind : null;
  const group = groupId ? groups.byId.get(groupId) : undefined;
  const main: MainGroup | null = fromNumber ?? group?.main ?? null;
  const sub = group?.parentId ? group : null;
  const subs = main ? groups.subgroupsOf(main) : [];

  const chooseMain = (m: MainGroup | 'none') => onChange(m === 'none' ? null : MAIN_GROUP_ID[m]);
  const chooseSub = (id: string | null) => onChange(id ?? (fromNumber || !main ? null : MAIN_GROUP_ID[main]));
  const add = async () => {
    if (!main || !newName.trim()) return;
    const g = await mutate((r) => r.groups.create({ main, name: newName, parentId: MAIN_GROUP_ID[main] }));
    setNewName('');
    setAdding(false);
    onChange(g.id);
  };

  const flow = groups.flowOf({ id: '', number, name: '', device: '', groupId, targets: {}, createdAt: 0, updatedAt: 0, deletedAt: null });

  return (
    <View style={{ gap: spacing.sm }}>
      {fromNumber ? (
        <Text style={{ color: p.text }}>
          {MAIN_GROUP_LABEL[fromNumber]} <Text style={{ color: p.muted }}>(aus der Artikelnummer)</Text>
        </Text>
      ) : (
        <Segmented
          options={[
            { value: 'device', label: 'Gesamtgerät' },
            { value: 'part', label: 'Front/Teil' },
            { value: 'none', label: 'Keine' },
          ]}
          value={main ?? 'none'}
          onChange={chooseMain}
        />
      )}
      {main && (
        <>
          <Text style={{ color: p.muted, fontSize: 12 }}>Untergruppe</Text>
          <View style={styles.chips}>
            <Chip label="Keine" selected={!sub} onPress={() => chooseSub(null)} />
            {subs.map((g) => (
              <Chip key={g.id} label={g.name} selected={sub?.id === g.id} onPress={() => chooseSub(g.id)} />
            ))}
            {!adding && <Chip label="+ Neu" onPress={() => setAdding(true)} />}
          </View>
          {adding && (
            <View style={styles.row}>
              <TextInput
                autoFocus
                value={newName}
                onChangeText={setNewName}
                onSubmitEditing={() => void add()}
                placeholder="Name der Untergruppe"
                placeholderTextColor={p.muted}
                accessibilityLabel="Name der neuen Untergruppe"
                style={[styles.input, { color: p.text, borderColor: p.border }]}
              />
              <Button title="OK" onPress={() => void add()} disabled={!newName.trim()} />
            </View>
          )}
          <Text style={{ color: p.muted, fontSize: 12 }}>
            {flow.steps.length ? `Ablauf: ${flow.steps.join(' → ')}` : 'Noch kein Ablauf – unter „Abläufe“ festlegen.'}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.sm, height: 44, fontSize: 16 },
});
