import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, usePalette } from '../theme';

/** Datum + Uhrzeit wählen; Android nutzt die System-Dialoge, iOS die kompakten Picker. */
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
  const date = new Date(value);

  if (Platform.OS === 'ios') {
    return (
      <View style={styles.row}>
        <Text style={[styles.label, { color: p.text }]}>{label}</Text>
        <DateTimePicker
          value={date}
          mode="datetime"
          display="compact"
          locale="de-DE"
          onChange={(_, d) => d && onChange(d.getTime())}
        />
      </View>
    );
  }

  const open = (mode: 'date' | 'time') =>
    DateTimePickerAndroid.open({
      value: date,
      mode,
      is24Hour: true,
      onChange: (event, d) => {
        if (event.type === 'set' && d) onChange(d.getTime());
      },
    });

  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: p.text }]}>{label}</Text>
      <View style={styles.buttons}>
        <Pressable onPress={() => open('date')} style={[styles.pill, { backgroundColor: p.track }]}>
          <Text style={{ color: p.text }}>{format(date, 'dd.MM.yyyy')}</Text>
        </Pressable>
        <Pressable onPress={() => open('time')} style={[styles.pill, { backgroundColor: p.track }]}>
          <Text style={{ color: p.text }}>{format(date, 'HH:mm')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  label: { fontSize: 16 },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  pill: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm },
});
