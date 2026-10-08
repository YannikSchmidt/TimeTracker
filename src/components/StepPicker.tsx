import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
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
  autoTakeOver = false,
  flowSteps = [],
  canHide = false,
  onRename,
  onHide,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  current: string | null;
  choices: string[];
  /** Zeit seit dem letzten Schrittwechsel bzw. seit dem Start (für „bisherige Zeit übernehmen“) */
  sinceMs?: number;
  /** nach „Schritt beendet“: die Zeit seitdem zählt ohne Rückfrage zum gewählten Schritt */
  autoTakeOver?: boolean;
  /** Schritte aus dem Ablauf – werden unter „Abläufe“ bearbeitet, nicht hier */
  flowSteps?: string[];
  /** Entfernen möglich (nur mit Artikel – die Auswahl gehört zum Artikel) */
  canHide?: boolean;
  /** Schritt in den eigenen Aufträgen umbenennen */
  onRename?: (from: string, to: string) => void;
  /** Schritt aus der Auswahl entfernen (gebuchte Zeiten bleiben) */
  onHide?: (step: string) => void;
  /** takeOver = bisherige Zeit (seit Start/letztem Wechsel) zählt auch zum gewählten Schritt */
  onPick: (step: string, takeOver: boolean) => void;
  onClose: () => void;
}) {
  const p = usePalette();
  const [text, setText] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  // Bearbeiten: früher verwendete Schritte umbenennen oder entfernen
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [hiding, setHiding] = useState<string | null>(null);
  const inFlow = new Set(flowSteps.map((s) => s.toLowerCase()));
  const name = text.trim();
  const existing = choices.find((c) => c.toLowerCase() === name.toLowerCase());
  const finish = (step: string, takeOver: boolean) => {
    setText('');
    setPending(null);
    onPick(step, takeOver);
  };
  // Erst fragen, wenn seit dem letzten Wechsel nennenswert Zeit lief (≥ 1 Minute)
  const pick = (step: string) =>
    step === current ? finish(step, false) : autoTakeOver ? finish(step, true) : sinceMs >= 60_000 ? setPending(step) : finish(step, false);
  const close = () => {
    setPending(null);
    setEditing(false);
    setRenaming(null);
    setHiding(null);
    onClose();
  };
  const rename = (from: string) => {
    const to = renameText.trim();
    setRenaming(null);
    if (to && to !== from) onRename?.(from, to);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: p.background }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: p.text }]} numberOfLines={2}>
              {title}
            </Text>
            {!pending && (onRename || onHide) && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={editing ? 'Bearbeiten beenden' : 'Schritte bearbeiten'}
                hitSlop={8}
                onPress={() => {
                  setEditing(!editing);
                  setRenaming(null);
                  setHiding(null);
                }}
                style={[styles.editBtn, { borderColor: editing ? p.primary : p.border, backgroundColor: editing ? p.primary + '1f' : 'transparent' }]}
              >
                <Ionicons name={editing ? 'checkmark' : 'create-outline'} size={16} color={editing ? p.primary : p.text} />
                <Text style={{ color: editing ? p.primary : p.text, fontSize: 13, fontWeight: '600' }}>{editing ? 'Fertig' : 'Bearbeiten'}</Text>
              </Pressable>
            )}
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
          ) : editing ? (
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: spacing.sm }}>
              {choices.map((s) =>
                renaming === s ? (
                  <View key={s} style={[styles.option, { borderColor: p.primary, backgroundColor: p.card }]}>
                    <TextInput
                      autoFocus
                      value={renameText}
                      onChangeText={setRenameText}
                      onSubmitEditing={() => rename(s)}
                      accessibilityLabel={`Neuer Name für ${s}`}
                      style={{ flex: 1, color: p.text, fontSize: 16, paddingVertical: 4 }}
                    />
                    <IconBtn icon="checkmark" label={`${s} umbenennen bestätigen`} color={p.success} onPress={() => rename(s)} />
                    <IconBtn icon="close" label="Umbenennen abbrechen" color={p.muted} onPress={() => setRenaming(null)} />
                  </View>
                ) : hiding === s ? (
                  <View key={s} style={[styles.option, { borderColor: p.danger, backgroundColor: p.danger + '14', flexDirection: 'column', alignItems: 'stretch' }]}>
                    <Text style={{ color: p.text }}>
                      „{s}“ aus der Auswahl entfernen? Bereits gebuchte Zeiten bleiben erhalten.
                    </Text>
                    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                      <View style={{ flex: 1 }}>
                        <Button title="Entfernen" icon="trash-outline" variant="danger" onPress={() => { setHiding(null); onHide?.(s); }} accessibilityLabel={`${s} entfernen bestätigen`} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Button title="Abbrechen" variant="secondary" onPress={() => setHiding(null)} />
                      </View>
                    </View>
                  </View>
                ) : (
                  <View key={s} style={[styles.option, { borderColor: p.border, backgroundColor: p.card }]}>
                    <Text style={{ color: p.text, fontSize: 17, flex: 1 }} numberOfLines={1}>
                      {s}
                    </Text>
                    {inFlow.has(s.toLowerCase()) ? (
                      <Text style={{ color: p.muted, fontSize: 12 }}>Ablauf</Text>
                    ) : (
                      <>
                        {onRename && (
                          <IconBtn
                            icon="pencil"
                            label={`${s} umbenennen`}
                            color={p.text}
                            onPress={() => {
                              setRenameText(s);
                              setRenaming(s);
                            }}
                          />
                        )}
                        {onHide && canHide && s !== current && (
                          <IconBtn icon="trash-outline" label={`${s} entfernen`} color={p.danger} onPress={() => setHiding(s)} />
                        )}
                      </>
                    )}
                  </View>
                ),
              )}
              <Text style={{ color: p.muted, fontSize: 12 }}>
                Umbenennen ändert den Namen in deinen Aufträgen mit diesem Artikel. Entfernen blendet den Schritt nur in der
                Auswahl aus{canHide ? '' : ' (nur bei Aufträgen mit Artikel möglich)'}; der aktuelle Schritt lässt sich nicht entfernen.
              </Text>
              {flowSteps.length > 0 && (
                <Button
                  title="Ablauf-Schritte bearbeiten"
                  icon="git-branch-outline"
                  variant="secondary"
                  onPress={() => {
                    close();
                    router.push('/flows');
                  }}
                />
              )}
            </ScrollView>
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

function IconBtn({ icon, label, color, onPress }: { icon: 'pencil' | 'trash-outline' | 'checkmark' | 'close'; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={8} onPress={onPress} style={{ padding: 4 }}>
      <Ionicons name={icon} size={20} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.lg },
  sheet: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, maxWidth: 520, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: 18, fontWeight: '700', flex: 1 },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  newRow: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md },
});
