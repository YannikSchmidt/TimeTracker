import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatClock } from '../domain/time';
import { radius, spacing, usePalette } from '../theme';
import { Button } from './ui';

/**
 * Kleines Menü am laufenden Arbeitsschritt (Schritt-Box in der Kachel antippen): Schritt beenden, Schritt-Uhr mit der
 * ganzen Arbeitszeit gleichsetzen oder die Zeit des Schritts löschen (wird „ohne Schritt“).
 */
export function StepMenu({
  visible,
  step,
  stepMs,
  workMs,
  otherStepsMs,
  onEnd,
  onAssignAll,
  onClear,
  onClose,
}: {
  visible: boolean;
  step: string;
  /** bisherige Zeit dieses Schritts */
  stepMs: number;
  /** ganze Arbeitszeit des Timers */
  workMs: number;
  /** Zeit, die auf anderen Schritten gebucht ist (wird beim Gleichsetzen mit übernommen) */
  otherStepsMs: number;
  onEnd: () => void;
  onAssignAll: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const p = usePalette();
  const [confirmClear, setConfirmClear] = useState(false);
  const close = () => {
    setConfirmClear(false);
    onClose();
  };
  const run = (fn: () => void) => {
    setConfirmClear(false);
    fn();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: p.background }]}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: p.text }]} numberOfLines={2}>
                {step}
              </Text>
              <Text style={{ color: p.muted }}>
                Schritt {formatClock(stepMs)} · Arbeitszeit {formatClock(workMs)}
              </Text>
            </View>
            <Pressable accessibilityLabel="Schritt-Menü schließen" hitSlop={12} onPress={close}>
              <Ionicons name="close" size={26} color={p.text} />
            </Pressable>
          </View>

          {confirmClear ? (
            <View style={{ gap: spacing.sm }}>
              <Text style={{ color: p.text }}>
                Zeit von „{step}“ ({formatClock(stepMs)}) löschen? Die Arbeitszeit bleibt, sie zählt dann „ohne Schritt“; der
                Timer läuft ohne Schritt weiter.
              </Text>
              <Button title="Ja, löschen" icon="trash-outline" variant="danger" onPress={() => run(onClear)} accessibilityLabel="Schrittzeit löschen bestätigen" />
              <Button title="Abbrechen" variant="secondary" onPress={() => setConfirmClear(false)} />
            </View>
          ) : (
            <View style={{ gap: spacing.sm }}>
              <Button title="Schritt beendet" icon="checkmark-done" variant="success" size="large" onPress={() => run(onEnd)} accessibilityLabel={`${step} beendet`} />
              <Text style={[styles.hint, { color: p.muted }]}>
                Die Zeit läuft weiter und zählt zum nächsten Schritt, den du wählst (Arbeitszeit minus beendete Schritte).
              </Text>
              <Button
                title={`= ganze Arbeitszeit (${formatClock(workMs)})`}
                icon="sync-outline"
                onPress={() => run(onAssignAll)}
                disabled={stepMs >= workMs}
                accessibilityLabel={`${step} gleich ganze Arbeitszeit`}
              />
              <Text style={[styles.hint, { color: p.muted }]}>
                Die Schritt-Uhr zeigt danach dasselbe wie die große Uhr.
                {otherStepsMs > 0 ? ` Auch die ${formatClock(otherStepsMs)} anderer Schritte zählen dann zu „${step}“.` : ''}
              </Text>
              <Button title="Schrittzeit löschen" icon="trash-outline" variant="secondary" onPress={() => setConfirmClear(true)} accessibilityLabel={`${step} Zeit löschen`} />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.lg },
  sheet: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, maxWidth: 520, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: { fontSize: 18, fontWeight: '700' },
  hint: { fontSize: 12, marginTop: -4, marginBottom: spacing.xs },
});
