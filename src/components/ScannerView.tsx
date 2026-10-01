import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { radius, spacing } from '../theme';
import { BARCODE_TYPES } from './ScanButton';
import { Button } from './ui';

/** onScan kann false liefern, um den Code zu ignorieren und weiter zu scannen. */
export type ScanHandler = (code: string) => boolean | void;

/**
 * Eingebetteter Live-Scanner: Kamera läuft sofort, der erste erkannte Code wird gemeldet.
 * Für jeden neuen Scan-Schritt neu einhängen (key wechseln).
 */
export function ScannerView({ hint, onScan }: { hint: string; onScan: ScanHandler }) {
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  if (!permission?.granted) {
    return (
      <View style={[styles.box, styles.center]}>
        <Text style={styles.text}>Zum Scannen braucht die App Zugriff auf die Kamera.</Text>
        <Button title="Kamera erlauben" icon="camera-outline" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
        onBarcodeScanned={({ data }) => {
          if (handled.current || !data?.trim()) return;
          handled.current = true;
          if (onScan(data.trim()) === false) {
            // ignoriert (z.B. derselbe Code wie eben) → kurz warten, dann weiter scannen
            setTimeout(() => (handled.current = false), 1200);
          }
        }}
      />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
        <View style={styles.frame} />
        <Text style={styles.hint}>{hint}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: 280, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  frame: { width: '70%', aspectRatio: 1.5, borderWidth: 3, borderColor: '#fff', borderRadius: radius.lg },
  hint: { color: '#fff', fontSize: 15, fontWeight: '600' },
  text: { color: '#fff', textAlign: 'center', fontSize: 15 },
});
