import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, usePalette } from '../theme';

/** Personenzähler: wie viele Personen arbeiten mit diesem Timer (1–20). */
export function WorkersStepper({ value, onChange, compact }: { value: number; onChange: (n: number) => void; compact?: boolean }) {
  const p = usePalette();
  const btn = (icon: 'remove' | 'add', next: number, label: string, disabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={6}
      onPress={() => onChange(next)}
      style={[styles.btn, compact && styles.btnCompact, { borderColor: p.border, backgroundColor: p.card, opacity: disabled ? 0.35 : 1 }]}
    >
      <Ionicons name={icon} size={compact ? 16 : 22} color={p.primary} />
    </Pressable>
  );
  return (
    <View style={styles.row}>
      {btn('remove', value - 1, 'Eine Person weniger', value <= 1)}
      <View style={styles.value}>
        <Ionicons name={value > 1 ? 'people' : 'person'} size={compact ? 14 : 18} color={p.text} />
        <Text style={{ color: p.text, fontWeight: '700', fontSize: compact ? 14 : 18 }} accessibilityLabel={`${value} Personen`}>
          {value} {value === 1 ? 'Person' : 'Personen'}
        </Text>
      </View>
      {btn('add', value + 1, 'Eine Person mehr', value >= 20)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  btn: { width: 44, height: 44, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  btnCompact: { width: 32, height: 32, borderRadius: radius.sm },
  value: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 100, justifyContent: 'center' },
});
