import { Ionicons } from '@expo/vector-icons';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, spacing, usePalette } from '../theme';

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  return <View style={[styles.card, { backgroundColor: p.card, borderColor: p.border }, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const p = usePalette();
  return (
    <View style={styles.sectionTitle}>
      <Text style={[styles.sectionTitleText, { color: p.muted }]}>{children}</Text>
      {right}
    </View>
  );
}

/** Aufklappbarer Bereich – hält die Statistik-Übersicht schlank. */
export function Expandable({
  title,
  icon,
  initiallyOpen = false,
  children,
}: {
  title: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  initiallyOpen?: boolean;
  children: ReactNode;
}) {
  const p = usePalette();
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <Card style={{ paddingVertical: 0 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={styles.expandHeader}
      >
        {icon && <Ionicons name={icon} size={18} color={p.primary} />}
        <Text style={[styles.expandTitle, { color: p.text }]}>{title}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={p.muted} />
      </Pressable>
      {open && <View style={styles.expandBody}>{children}</View>}
    </Card>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const p = usePalette();
  return (
    <View style={[styles.segmented, { backgroundColor: p.track }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && { backgroundColor: p.card }]}
          >
            <Text style={{ color: active ? p.text : p.muted, fontWeight: active ? '600' : '400' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({
  label,
  color,
  selected,
  onPress,
  onLongPress,
}: {
  label: string;
  color?: string;
  selected?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const p = usePalette();
  const tint = color ?? p.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        styles.chip,
        { borderColor: selected ? tint : p.border, backgroundColor: selected ? tint + '22' : p.card },
      ]}
    >
      {color && <View style={[styles.dot, { backgroundColor: color }]} />}
      <Text style={{ color: p.text, fontWeight: selected ? '600' : '400' }}>{label}</Text>
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'normal',
  icon,
  disabled,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning';
  size?: 'normal' | 'large';
  icon?: ComponentProps<typeof Ionicons>['name'];
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const p = usePalette();
  const bg = { primary: p.primary, danger: p.danger, success: p.success, warning: p.warning, secondary: p.track }[variant];
  const fg = variant === 'secondary' ? p.text : p.onPrimary;
  const large = size === 'large';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        large && styles.buttonLarge,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
      ]}
    >
      {icon && <Ionicons name={icon} size={large ? 24 : 18} color={fg} />}
      <Text style={[styles.buttonText, large && styles.buttonTextLarge, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Empty({ text }: { text: string }) {
  const p = usePalette();
  return <Text style={[styles.empty, { color: p.muted }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitleText: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  expandHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  expandTitle: { flex: 1, fontSize: 16, fontWeight: '600' },
  expandBody: { paddingBottom: spacing.lg },
  segmented: { flexDirection: 'row', borderRadius: radius.md, padding: 3 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  buttonLarge: { paddingVertical: spacing.lg, borderRadius: radius.lg },
  buttonTextLarge: { fontSize: 19, fontWeight: '700' },
  empty: { textAlign: 'center', paddingVertical: spacing.xl },
});
