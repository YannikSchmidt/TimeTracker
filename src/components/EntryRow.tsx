import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { entryDuration, formatDuration, formatTime } from '../domain/time';
import type { DimensionValue, Entry } from '../domain/types';
import { spacing, usePalette } from '../theme';

export function EntryRow({
  entry,
  valuesById,
  now,
}: {
  entry: Entry;
  valuesById: Map<string, DimensionValue>;
  now: number;
}) {
  const p = usePalette();
  const values = entry.valueIds.map((id) => valuesById.get(id)).filter((v): v is DimensionValue => !!v);
  const color = values[0]?.color ?? p.border;
  const running = entry.endAt === null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/entry/${entry.id}`)}
      style={({ pressed }) => [styles.row, { backgroundColor: p.card, opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={[styles.bar, { backgroundColor: color }]} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: p.text, fontWeight: '600' }} numberOfLines={1}>
          {values.length > 0 ? values.map((v) => v.name).join(' · ') : entry.note || 'Ohne Zuordnung'}
        </Text>
        <Text style={{ color: p.muted, fontSize: 13 }} numberOfLines={1}>
          {formatTime(entry.startAt)} – {running ? 'läuft' : formatTime(entry.endAt!)}
          {values.length > 0 && entry.note ? `  ·  ${entry.note}` : ''}
        </Text>
      </View>
      <Text style={{ color: running ? p.primary : p.text, fontVariant: ['tabular-nums'], fontWeight: '600' }}>
        {formatDuration(entryDuration(entry, now))}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingRight: spacing.lg,
    borderRadius: 12,
    overflow: 'hidden',
  },
  bar: { width: 4, alignSelf: 'stretch', borderRadius: 2, marginLeft: spacing.sm },
});
