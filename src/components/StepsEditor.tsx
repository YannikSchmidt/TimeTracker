import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { radius, spacing, usePalette } from '../theme';
import { Chip } from './ui';

/** Ablauf bearbeiten: Schritte in Reihenfolge, verschieben, entfernen, hinzufügen (mit Vorschlägen). */
export function StepsEditor({
  steps,
  onChange,
  suggestions,
  label,
}: {
  steps: string[];
  onChange: (steps: string[]) => void;
  suggestions: string[];
  label: string;
}) {
  const p = usePalette();
  const [text, setText] = useState('');
  const add = (name: string) => {
    const n = name.trim();
    if (!n || steps.some((s) => s.toLowerCase() === n.toLowerCase())) return setText('');
    onChange([...steps, n]);
    setText('');
  };
  const move = (i: number, d: -1 | 1) => {
    const next = [...steps];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  const open = suggestions.filter((s) => !steps.some((x) => x.toLowerCase() === s.toLowerCase()));
  const matching = text.trim() ? open.filter((s) => s.toLowerCase().includes(text.trim().toLowerCase())) : open;

  return (
    <View style={{ gap: spacing.sm }}>
      {steps.map((s, i) => (
        <View key={s} style={[styles.row, { borderColor: p.border }]}>
          <Text style={[styles.num, { color: p.muted }]}>{i + 1}.</Text>
          <Text style={{ color: p.text, flex: 1, fontSize: 16 }}>{s}</Text>
          <IconButton icon="arrow-up" label={`${s} nach oben`} disabled={i === 0} onPress={() => move(i, -1)} />
          <IconButton icon="arrow-down" label={`${s} nach unten`} disabled={i === steps.length - 1} onPress={() => move(i, 1)} />
          <IconButton icon="close" label={`${s} entfernen`} onPress={() => onChange(steps.filter((_, j) => j !== i))} />
        </View>
      ))}
      <View style={[styles.row, { borderColor: p.border }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => add(text)}
          placeholder={steps.length ? 'Weiterer Schritt …' : 'Erster Schritt, z.B. Teile holen'}
          placeholderTextColor={p.muted}
          returnKeyType="done"
          accessibilityLabel={label}
          style={{ flex: 1, color: p.text, fontSize: 16, paddingVertical: 6 }}
        />
        <IconButton icon="add" label={`${label} hinzufügen`} disabled={!text.trim()} onPress={() => add(text)} />
      </View>
      {matching.length > 0 && (
        <View style={styles.chips}>
          {matching.slice(0, 8).map((s) => (
            <Chip key={s} label={`+ ${s}`} onPress={() => add(s)} />
          ))}
        </View>
      )}
    </View>
  );
}

function IconButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: 'arrow-up' | 'arrow-down' | 'close' | 'add';
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const p = usePalette();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={6} disabled={disabled} onPress={onPress} style={{ padding: 4, opacity: disabled ? 0.3 : 1 }}>
      <Ionicons name={icon} size={20} color={icon === 'close' ? p.danger : p.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 4 },
  num: { width: 22, fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
