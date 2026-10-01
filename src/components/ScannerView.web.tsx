import { Ionicons } from '@expo/vector-icons';
import { createElement, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, usePalette } from '../theme';
import { decodeImage } from './barcode.web';

/**
 * Browser-Version des eingebetteten Scanners: großer Knopf öffnet die Kamera-App,
 * das Foto wird ausgewertet (Live-Kamera ist in eingebetteten Seiten oft gesperrt).
 */
export function ScannerView({ hint, onScan }: { hint: string; onScan: (code: string) => void }) {
  const p = usePalette();
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const code = await decodeImage(file);
      if (code?.trim()) onScan(code.trim());
      else setError('Kein Code erkannt – bitte näher und scharf fotografieren.');
    } catch {
      setError('Das Foto konnte nicht gelesen werden.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={hint}
        onPress={() => input.current?.click()}
        style={({ pressed }) => [styles.box, { backgroundColor: p.primary, opacity: pressed ? 0.85 : 1 }]}
      >
        {busy ? (
          <ActivityIndicator size="large" color={p.onPrimary} />
        ) : (
          <Ionicons name="scan-outline" size={64} color={p.onPrimary} />
        )}
        <Text style={[styles.title, { color: p.onPrimary }]}>{hint}</Text>
        <Text style={{ color: p.onPrimary, opacity: 0.85 }}>Tippen, Code fotografieren</Text>
      </Pressable>
      {createElement('input', {
        ref: input,
        type: 'file',
        accept: 'image/*',
        capture: 'environment',
        'aria-label': `${hint} (Foto)`,
        style: { display: 'none' },
        onChange: (e: { target: HTMLInputElement }) => onFile(e.target.files?.[0]),
      })}
      {error && <Text style={{ color: p.danger, textAlign: 'center' }}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: 200, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  title: { fontSize: 20, fontWeight: '700' },
});
