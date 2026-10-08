import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { formatMinutes, parseMinutes, targetSteps, WHOLE_ORDER, type StepTarget } from '../domain/targets';
import { formatDuration } from '../domain/time';
import { radius, spacing, usePalette } from '../theme';

type Draft = Record<string, { setup: string; perPiece: string }>;

/**
 * Vorgabezeiten eines Artikels in Minuten: je Arbeitsschritt Rüstzeit (einmal pro Auftrag)
 * und Einzelzeit (pro Stück). Ohne Ablauf eine Zeile für den ganzen Auftrag.
 */
export function TargetsEditor({
  steps,
  targets,
  onChange,
  exampleQuantity,
  keyPrefix = '',
  labelPrefix = '',
}: {
  steps: string[];
  targets: Record<string, StepTarget>;
  onChange: (targets: Record<string, StepTarget>) => void;
  exampleQuantity: number;
  /** Schlüssel-Präfix am Artikel (Display-Verheiratung: „display:“) */
  keyPrefix?: string;
  /** Präfix der Bedienhilfen-Beschriftung, z.B. „Display “ */
  labelPrefix?: string;
}) {
  const p = usePalette();
  const [draft, setDraft] = useState<Draft>(() =>
    Object.fromEntries(Object.entries(targets).map(([k, t]) => [k, { setup: formatMinutes(t.setup), perPiece: formatMinutes(t.perPiece) }])),
  );
  const rows = targetSteps(steps);

  const set = (row: string, field: 'setup' | 'perPiece', text: string) => {
    const step = keyPrefix + row;
    const clean = text.replace(/[^0-9.,]/g, '');
    const next = { ...draft, [step]: { ...(draft[step] ?? { setup: '', perPiece: '' }), [field]: clean } };
    setDraft(next);
    onChange({
      ...targets,
      [step]: { setup: parseMinutes(next[step].setup), perPiece: parseMinutes(next[step].perPiece) },
    });
  };

  const totalMin = rows.reduce(
    (s, step) => s + (targets[keyPrefix + step]?.setup ?? 0) + (targets[keyPrefix + step]?.perPiece ?? 0) * exampleQuantity,
    0,
  );

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.row}>
        <Text style={[styles.name, { color: p.muted, fontSize: 12 }]}>{steps.length ? 'Schritt' : ''}</Text>
        <Text style={[styles.head, { color: p.muted }]}>Rüsten</Text>
        <Text style={[styles.head, { color: p.muted }]}>je Stück</Text>
      </View>
      {rows.map((step) => (
        <View key={step} style={styles.row}>
          <Text style={[styles.name, { color: p.text }]} numberOfLines={2}>
            {step === WHOLE_ORDER ? 'Ganzer Auftrag' : step}
          </Text>
          {(['setup', 'perPiece'] as const).map((field) => (
            <TextInput
              key={field}
              value={draft[keyPrefix + step]?.[field] ?? ''}
              onChangeText={(t) => set(step, field, t)}
              placeholder="0"
              placeholderTextColor={p.muted}
              keyboardType="decimal-pad"
              accessibilityLabel={`${labelPrefix}${field === 'setup' ? 'Rüstzeit' : 'Einzelzeit'} ${step === WHOLE_ORDER ? 'Auftrag' : step}`}
              style={[styles.input, { color: p.text, borderColor: p.border }]}
            />
          ))}
        </View>
      ))}
      <Text style={{ color: p.muted, fontSize: 12 }}>
        Minuten. Rüstzeit zählt einmal pro Auftrag, Einzelzeit pro Stück.
        {totalMin > 0 ? ` Vorgabe bei ${exampleQuantity} Stk: ${formatDuration(totalMin * 60_000)}.` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1, minWidth: 0 },
  head: { width: 78, textAlign: 'center', fontSize: 12 },
  input: { width: 78, height: 40, borderWidth: 1, borderRadius: radius.sm, textAlign: 'center', fontSize: 16 },
});
