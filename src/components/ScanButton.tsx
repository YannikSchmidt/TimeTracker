import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { radius, spacing, usePalette } from '../theme';
import type { ScanKind } from './barcode.web';
import { useScanConfirm } from '../hooks/useRequiredReads';
import { Button } from './ui';

/**
 * Codes der Auftragspapiere (Auftrag: Code 39, Artikel: Data Matrix, Code 128 als Reserve) bzw. QR-Codes
 * (Einladungen) – die Kamera liest nur diese. Andere Strichcode-Arten (ITF, Codabar …) lesen halbe Code-39-Codes
 * gern als kürzere, falsche Nummer.
 */
export const BARCODE_TYPES: Record<ScanKind, BarcodeType[]> = {
  barcode: ['code39', 'code128', 'datamatrix'],
  qr: ['qr'],
};

/** Kamera-Button: öffnet einen Vollbild-Scanner und liefert den ersten erkannten Code. */
export function ScanButton({ label, onScan, kind = 'barcode' }: { label: string; onScan: (code: string) => void; kind?: ScanKind }) {
  const p = usePalette();
  const [open, setOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  // Der Scanner meldet einen Code oft mehrfach hintereinander – nur den ersten übernehmen.
  const handled = useRef(false);
  const confirm = useScanConfirm(kind);

  const openScanner = async () => {
    handled.current = false;
    confirm.reset();
    if (!permission?.granted) await requestPermission();
    setOpen(true);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={openScanner}
        style={({ pressed }) => [styles.button, { backgroundColor: p.primary, opacity: pressed ? 0.8 : 1 }]}
      >
        <Ionicons name="scan-outline" size={22} color={p.onPrimary} />
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>{label}</Text>
            <Pressable accessibilityLabel="Scanner schließen" hitSlop={12} onPress={() => setOpen(false)}>
              <Ionicons name="close" size={28} color="#fff" />
            </Pressable>
          </View>
          {permission?.granted ? (
            <View style={styles.cameraBox}>
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES[kind] }}
                onBarcodeScanned={({ data }) => {
                  if (handled.current || !data?.trim() || !confirm.accept(data)) return;
                  handled.current = true;
                  setOpen(false);
                  onScan(data.trim());
                }}
              />
              <View pointerEvents="none" style={styles.frame} />
              <Text style={styles.hint}>Code in den Rahmen halten</Text>
            </View>
          ) : (
            <View style={styles.permission}>
              <Text style={styles.permissionText}>
                Für das Scannen braucht die App Zugriff auf die Kamera.
              </Text>
              <Button title="Kamera erlauben" icon="camera-outline" onPress={requestPermission} />
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  modal: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  title: { color: '#fff', fontSize: 18, fontWeight: '600' },
  cameraBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: { width: '75%', aspectRatio: 1.4, borderWidth: 3, borderColor: '#fff', borderRadius: radius.lg },
  hint: { color: '#fff', marginTop: spacing.lg, fontSize: 15 },
  permission: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  permissionText: { color: '#fff', fontSize: 16, textAlign: 'center' },
});
