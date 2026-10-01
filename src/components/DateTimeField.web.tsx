import { format } from 'date-fns';
import { createElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { radius, spacing, usePalette } from '../theme';

/** Browser-Version: natives Datum/Uhrzeit-Feld des Browsers. */
export function DateTimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const p = usePalette();
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: p.text }]}>{label}</Text>
      {createElement('input', {
        type: 'datetime-local',
        'aria-label': label,
        value: format(value, "yyyy-MM-dd'T'HH:mm"),
        onChange: (e: { target: { value: string } }) => {
          const ts = new Date(e.target.value).getTime();
          if (Number.isFinite(ts)) onChange(ts);
        },
        style: {
          font: 'inherit',
          fontSize: 16,
          color: p.text,
          background: p.track,
          border: 'none',
          borderRadius: radius.sm,
          padding: `${spacing.sm}px ${spacing.md}px`,
        },
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm, gap: spacing.md },
  label: { fontSize: 16 },
});
