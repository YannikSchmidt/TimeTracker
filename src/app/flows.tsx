import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { StepsEditor } from '../components/StepsEditor';
import { Button, Card, SectionTitle, Segmented } from '../components/ui';
import { useData } from '../data/DataProvider';
import { MAIN_GROUP_ID, MAIN_GROUP_LABEL, SECTION_LABEL } from '../domain/flows';
import type { MainGroup, ProductGroup } from '../domain/types';
import { useGroups } from '../hooks/useGroups';
import { radius, spacing, usePalette } from '../theme';

/**
 * Abläufe verwalten: Gesamtgeräte und Fronten sind strikt getrennt. Jede Hauptgruppe hat einen Standard-Ablauf,
 * Untergruppen können einen eigenen haben (leer = Standard). Gesamtgeräte haben je einen Ablauf für die
 * Display-Verheiratung und für die Gesamtmontage (zwei eigenständige Aufträge).
 */
export default function FlowsScreen() {
  const p = usePalette();
  const { mutate } = useData();
  const groups = useGroups();
  const [main, setMain] = useState<MainGroup>('device');
  const [open, setOpen] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const mainGroup = groups.byId.get(MAIN_GROUP_ID[main]);
  const subs = groups.subgroupsOf(main);
  const save = (id: string, input: GroupInput) => void mutate((r) => r.groups.update(id, input));
  const device = main === 'device';
  const addSub = async () => {
    const name = newName.trim();
    if (!name) return;
    const g = await mutate((r) => r.groups.create({ main, name, parentId: MAIN_GROUP_ID[main] }));
    setNewName('');
    setOpen(g.id);
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Segmented
        options={[
          { value: 'device', label: MAIN_GROUP_LABEL.device },
          { value: 'part', label: MAIN_GROUP_LABEL.part },
        ]}
        value={main}
        onChange={(m) => {
          setMain(m);
          setOpen(null);
        }}
      />

      <SectionTitle>Standard-Ablauf {MAIN_GROUP_LABEL[main]}</SectionTitle>
      <Card style={{ gap: spacing.sm }}>
        <Text style={{ color: p.muted, fontSize: 12 }}>
          Gilt für alle Artikel dieser Gruppe ohne eigenen Ablauf der Untergruppe.
          {device ? ' Display-Verheiratung und Gesamtmontage sind eigene Aufträge mit eigenem Ablauf.' : ''}
        </Text>
        {mainGroup && device && (
          <>
            <Text style={[styles.flowTitle, { color: p.text }]}>{SECTION_LABEL.display}</Text>
            <StepsEditor
              steps={mainGroup.displaySteps ?? []}
              onChange={(displaySteps) => save(mainGroup.id, { displaySteps })}
              suggestions={groups.knownSteps}
              label={`Display-Schritt ${MAIN_GROUP_LABEL[main]}`}
            />
            <Text style={[styles.flowTitle, { color: p.text }]}>{SECTION_LABEL.assembly}</Text>
          </>
        )}
        {mainGroup && (
          <StepsEditor
            steps={mainGroup.steps}
            onChange={(steps) => save(mainGroup.id, { steps })}
            suggestions={groups.knownSteps}
            label={`Schritt ${MAIN_GROUP_LABEL[main]}`}
          />
        )}
      </Card>

      <SectionTitle>Untergruppen</SectionTitle>
      {subs.length === 0 && <Text style={{ color: p.muted }}>Noch keine Untergruppen.</Text>}
      {subs.map((g) => (
        <SubgroupCard
          key={g.id}
          group={g}
          open={open === g.id}
          onToggle={() => setOpen(open === g.id ? null : g.id)}
          fallback={mainGroup?.steps ?? []}
          displayFallback={device ? (mainGroup?.displaySteps ?? []) : null}
          suggestions={groups.knownSteps}
          onSave={(input) => save(g.id, input)}
        />
      ))}
      <View style={styles.addRow}>
        <TextInput
          value={newName}
          onChangeText={setNewName}
          onSubmitEditing={() => void addSub()}
          placeholder="Neue Untergruppe, z.B. Kühlschrank"
          placeholderTextColor={p.muted}
          accessibilityLabel="Neue Untergruppe"
          style={[styles.input, { color: p.text, borderColor: p.border, backgroundColor: p.card }]}
        />
        <Button title="Anlegen" icon="add" onPress={() => void addSub()} disabled={!newName.trim()} />
      </View>
    </ScrollView>
  );
}

type GroupInput = { name?: string; steps?: string[]; displaySteps?: string[] };

function SubgroupCard({
  group,
  open,
  onToggle,
  fallback,
  displayFallback,
  suggestions,
  onSave,
}: {
  group: ProductGroup;
  open: boolean;
  onToggle: () => void;
  fallback: string[];
  /** Gesamtgeräte: Standard-Ablauf der Display-Verheiratung; null = keine Aufteilung (Fronten) */
  displayFallback: string[] | null;
  suggestions: string[];
  onSave: (input: GroupInput) => void;
}) {
  const p = usePalette();
  const [name, setName] = useState(group.name);
  const own = group.steps.length > 0;
  const ownDisplay = (group.displaySteps ?? []).length > 0;
  return (
    <Card style={{ gap: spacing.sm }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Untergruppe ${group.name}`} onPress={onToggle} style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: p.text, fontWeight: '700', fontSize: 16 }}>{group.name}</Text>
          <Text style={{ color: p.muted, fontSize: 12 }} numberOfLines={1}>
            {displayFallback && ownDisplay ? `Display: ${(group.displaySteps ?? []).join(' → ')} · ` : ''}
            {own ? group.steps.join(' → ') : `Standard-Ablauf${fallback.length ? `: ${fallback.join(' → ')}` : ''}`}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={p.muted} />
      </Pressable>
      {open && (
        <>
          <TextInput
            value={name}
            onChangeText={setName}
            onBlur={() => name.trim() && name !== group.name && onSave({ name })}
            accessibilityLabel="Name der Untergruppe"
            style={[styles.nameInput, { color: p.text, borderColor: p.border }]}
          />
          <Text style={{ color: p.muted, fontSize: 12 }}>Eigener Ablauf (leer lassen = Standard-Ablauf der Hauptgruppe):</Text>
          {displayFallback && (
            <>
              <Text style={[styles.flowTitle, { color: p.text }]}>{SECTION_LABEL.display}</Text>
              <StepsEditor
                steps={group.displaySteps ?? []}
                onChange={(displaySteps) => onSave({ displaySteps })}
                suggestions={suggestions}
                label={`Display-Schritt ${group.name}`}
              />
              {!ownDisplay && displayFallback.length > 0 && (
                <Button title="Standard-Ablauf Display übernehmen und anpassen" variant="secondary" onPress={() => onSave({ displaySteps: displayFallback })} />
              )}
              <Text style={[styles.flowTitle, { color: p.text }]}>{SECTION_LABEL.assembly}</Text>
            </>
          )}
          <StepsEditor steps={group.steps} onChange={(steps) => onSave({ steps })} suggestions={suggestions} label={`Schritt ${group.name}`} />
          {!own && fallback.length > 0 && <Button title="Standard-Ablauf übernehmen und anpassen" variant="secondary" onPress={() => onSave({ steps: fallback })} />}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flowTitle: { fontWeight: '700', fontSize: 15, marginTop: spacing.xs },
  addRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  nameInput: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 44, fontSize: 16 },
  input: { flex: 1, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 48, fontSize: 16 },
});
