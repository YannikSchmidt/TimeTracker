import { ScrollView, StyleSheet } from 'react-native';

import type { OwnerFilter } from '../hooks/useWork';
import { spacing } from '../theme';
import { Chip } from './ui';

/** Auswahl „Ich / Person / Alle“ – nur sichtbar, wenn weitere Personen im Team sind. */
export function OwnerFilterBar({
  others,
  value,
  onChange,
}: {
  others: string[];
  value: OwnerFilter;
  onChange: (value: OwnerFilter) => void;
}) {
  if (others.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      <Chip label="Ich" selected={value === 'me'} onPress={() => onChange('me')} />
      {others.map((login) => (
        <Chip key={login} label={login} selected={value === login} onPress={() => onChange(login)} />
      ))}
      <Chip label="Alle" selected={value === 'all'} onPress={() => onChange('all')} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: spacing.xs },
});
