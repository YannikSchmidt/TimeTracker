import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { useData } from '../data/DataProvider';
import { CODE_KIND_LABEL, DEFAULT_CODE_PATTERNS, type CodePatterns } from '../domain/codes';
import { radius, spacing, usePalette } from '../theme';
import { Button, Card } from './ui';

const FIELDS: (keyof CodePatterns)[] = ['order', 'device', 'part'];

/** Einstellungen: Aufbau der Nummern, an dem der Scanner Auftrag und Artikel unterscheidet. */
export function CodePatternsCard({ patterns }: { patterns: CodePatterns }) {
  const p = usePalette();
  const { mutate } = useData();
  const [draft, setDraft] = useState<CodePatterns>(patterns);
  const [shown, setShown] = useState(patterns);
  if (shown !== patterns) {
    setShown(patterns);
    setDraft(patterns);
  }

  const save = (next: CodePatterns) => void mutate((r) => r.settings.set({ codePatterns: next }));
  const isDefault = FIELDS.every((k) => patterns[k] === DEFAULT_CODE_PATTERNS[k]);

  return (
    <Card style={{ gap: spacing.md }}>
      <Text style={{ color: p.muted, fontSize: 12 }}>
        Daran erkennt der Scanner, was gescannt wurde – die Reihenfolge ist dann egal. „*“ steht für eine beliebige Ziffer,
        mehrere Muster mit Komma trennen.
      </Text>
      {FIELDS.map((key) => (
        <View key={key} style={{ gap: 4 }}>
          <Text style={{ color: p.text, fontWeight: '600' }}>{CODE_KIND_LABEL[key]}</Text>
          <TextInput
            value={draft[key]}
            onChangeText={(t) => setDraft((d) => ({ ...d, [key]: t }))}
            onBlur={() => draft[key] !== patterns[key] && save(draft)}
            autoCapitalize="characters"
            autoCorrect={false}
            accessibilityLabel={`Muster ${CODE_KIND_LABEL[key]}`}
            style={[styles.input, { color: p.text, borderColor: p.border }]}
          />
        </View>
      ))}
      {!isDefault && <Button title="Standard wiederherstellen" variant="secondary" onPress={() => save(DEFAULT_CODE_PATTERNS)} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.sm, height: 40, fontSize: 15 },
});
