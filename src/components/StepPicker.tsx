import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatDuration } from '../domain/time';
import { radius, spacing, usePalette } from '../theme';
import { Button } from './ui';

/**
 * Arbeitsschritt wählen: alle bekannten Schritte des Artikels (Ablauf + bisher verwendete) und ein Feld für
 * einen neuen. Ab der Auswahl wird die Zeit auf diesen Schritt gebucht. Lief schon Zeit seit dem Start bzw. dem
 * letzten Wechsel, fragt die App, ob diese Zeit auch zum gewählten Schritt zählen soll.
 */
export function StepPicker({
  visible,
  title,
  current,
  choices,
  sinceMs = 0,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  current: string | null;
  choices: string[];
  /** Zeit seit dem letzten Schrittwechsel bzw. seit dem Start (für „bisherige Zeit übernehmen“) */
  sinceMs?: number;
  /** takeOver = bisherige Zeit (seit Start/letztem Wechsel) zählt auch zum gewählten Schritt */
  onPick: (step: string, takeOver: boolean) => void;
  onClose: () => void;
}) {
  const p = usePalette();
  const [text, setText] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const name = text.trim();
  const existing = choices.find((c) => c.toLowerCase() === name.toLowerCase());
  const finish = (step: string, takeOver: boolean) => {
    setText('');
    setPending(null);
    onPick(step, takeOver);
  };
  // Erst fragen, wenn seit dem letzten Wechsel nennenswert Zeit lief (≥ 1 Minute)
  const pick = (step: string) => (step !== current && sinceMs >= 60_000 ? setPending(step) : finish(step, false));
  const close = () => {
    setPending(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: p.background }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: p.text }]} numberOfLines={2}>
              {title}
            </Text>
            <Pressable accessibilityLabel="Schrittauswahl schließen" hitSlop={12} onPress={close}>
              <Ionicons name="close" size={26} color={p.text} />
            </Pressable>
          </View>
          {pending ? (
            <View style={{ gap: spacing.md }}>
              <Text style={{ color: p.text, fontSize: 17 }}>
                Bisherige Zeit ({formatDuration(sinceMs)} {current ? `seit „${current}“` : 'seit dem Start'}) auch zu{' '}
                <Text style={{ fontWeight: '700' }}>„{pending}“</Text> zählen?
              </Text>
              <Button title="Ja, übernehmen" icon="checkmark" variant="success" size="large" onPress={() => finish(pending, true)} />
              <Button title="Nein, ab jetzt" variant="secondary" onPress={() => finish(pending, false)} />
            </View>
          ) : (
            <>
            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: spacing.sm }}>
              {choices.length === 0 && <Text style={{ color: p.muted }}>Noch keine Arbeitsschritte für diesen Artikel – unten einen neuen eingeben.</Text>}
              {choices.map((s) => {
                const active = s === current;
                return (
                  <Pressable
                    key={s}
                    accessibilityRole="button"
                    accessibilityLabel={`Schritt ${s}`}
                    accessibilityState={{ selected: active }}
                    onPress={() => pick(s)}
                    style={({ pressed }) => [
                      styles.option,
                      { borderColor: active ? p.success : p.border, backgroundColor: active ? p.success + '1f' : p.card, opacity: pressed ? 0.8 : 1 },
                    ]}
                  >
                    <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={20} color={active ? p.success : p.muted} />
                    <Text style={{ color: p.text, fontSize: 17, flex: 1 }}>{s}</Text>
                    {active && <Text style={{ color: p.success, fontSize: 12, fontWeight: '700' }}>AKTUELL</Text>}
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={[styles.newRow, { borderColor: p.border, backgroundColor: p.card }]}>
              <TextInput
                value={text}
                onChangeText={setText}
                onSubmitEditing={() => name && pick(existing ?? name)}
                placeholder="Neuer Arbeitsschritt …"
                placeholderTextColor={p.muted}
                returnKeyType="done"
                accessibilityLabel="Neuer Arbeitsschritt"
                style={{ flex: 1, color: p.text, fontSize: 16, paddingVertical: 8 }}
              />
            </View>
            <Button
              title={existing ? `Weiter mit „${existing}“` : name ? `„${name}“ starten` : 'Schritt eingeben'}
              icon="play"
              variant="success"
              disabled={!name}
              onPress={() => pick(existing ?? name)}
              accessibilityLabel="Neuen Arbeitsschritt übernehmen"
            />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.lg },
  sheet: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, maxWidth: 520, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: 18, fontWeight: '700', flex: 1 },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  newRow: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md },
});
