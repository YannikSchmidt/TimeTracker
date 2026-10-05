import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, usePalette } from '../theme';
import type { ScanKind } from './barcode.web';
import { ScannerView } from './ScannerView';

/** Kamera-Knopf (Browser): öffnet den Scanner (live oder per Foto) als Overlay. */
export function ScanButton({ label, onScan, kind = 'barcode' }: { label: string; onScan: (code: string) => void; kind?: ScanKind }) {
  const p = usePalette();
  const [open, setOpen] = useState(false);

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.button, { backgroundColor: p.primary, opacity: pressed ? 0.8 : 1 }]}
      >
        <Ionicons name="scan-outline" size={22} color={p.onPrimary} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: p.background }]}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: p.text }]}>{label}</Text>
              <Pressable accessibilityLabel="Scanner schließen" hitSlop={12} onPress={() => setOpen(false)}>
                <Ionicons name="close" size={26} color={p.text} />
              </Pressable>
            </View>
            {open && (
              <ScannerView
                hint={label}
                kind={kind}
                onScan={(code) => {
                  setOpen(false);
                  onScan(code);
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.lg },
  sheet: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, maxWidth: 520, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700' },
});
