import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { useData } from '../data/DataProvider';
import type { Dimension } from '../domain/types';
import type { DimensionsData } from '../hooks/useDimensions';
import { spacing, usePalette, VALUE_COLORS } from '../theme';
import { Chip, SectionTitle } from './ui';

/**
 * Auswahl der Werte aller aktiven Merkmale (Projekt, Tags, Person, …).
 * Neue Werte können direkt per „+“ angelegt werden.
 */
export function DimensionPicker({
  dims,
  selected,
  onChange,
}: {
  dims: DimensionsData;
  selected: string[];
  onChange: (valueIds: string[]) => void;
}) {
  return (
    <View style={{ gap: spacing.lg }}>
      {dims.enabled.map((dimension) => (
        <ValuePicker key={dimension.id} dimension={dimension} dims={dims} selected={selected} onChange={onChange} />
      ))}
    </View>
  );
}

function ValuePicker({
  dimension,
  dims,
  selected,
  onChange,
}: {
  dimension: Dimension;
  dims: DimensionsData;
  selected: string[];
  onChange: (valueIds: string[]) => void;
}) {
  const p = usePalette();
  const { mutate } = useData();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  // Submit und Blur feuern oft beide – nur einmal anlegen.
  const finished = useRef(false);
  const own = dims.valuesOf(dimension.id);
  const ownIds = new Set(dims.valuesOf(dimension.id, true).map((v) => v.id));

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else if (dimension.multi) {
      onChange([...selected, id]);
    } else {
      onChange([...selected.filter((s) => !ownIds.has(s)), id]);
    }
  };

  const startAdding = () => {
    finished.current = false;
    setAdding(true);
  };

  const create = async () => {
    if (finished.current) return;
    finished.current = true;
    const trimmed = name.trim();
    setAdding(false);
    setName('');
    if (!trimmed) return;
    const color = VALUE_COLORS[dims.valuesOf(dimension.id, true).length % VALUE_COLORS.length];
    const value = await mutate((r) => r.dimensions.createValue({ dimensionId: dimension.id, name: trimmed, color }));
    toggle(value.id);
  };

  return (
    <View>
      <SectionTitle>{dimension.name}</SectionTitle>
      <View style={styles.wrap}>
        {own.map((v) => (
          <Chip
            key={v.id}
            label={v.name}
            color={dimension.multi ? undefined : v.color}
            selected={selected.includes(v.id)}
            onPress={() => toggle(v.id)}
          />
        ))}
        {adding ? (
          <TextInput
            autoFocus
            value={name}
            onChangeText={setName}
            onSubmitEditing={create}
            onBlur={create}
            placeholder={`Neu: ${dimension.name}`}
            placeholderTextColor={p.muted}
            returnKeyType="done"
            style={[styles.input, { color: p.text, borderColor: p.primary }]}
          />
        ) : (
          <Chip label="+ Neu" onPress={startAdding} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  input: { borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 6, minWidth: 140 },
});
