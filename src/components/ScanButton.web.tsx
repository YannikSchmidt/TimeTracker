import { Ionicons } from '@expo/vector-icons';
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from '@zxing/library';
import { createElement, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, usePalette } from '../theme';

/**
 * Browser-Version: Live-Kamera ist in eingebetteten Seiten oft gesperrt, Datei-Uploads
 * aber nicht. Der Button öffnet daher die Foto-Aufnahme; das Foto wird ausgewertet.
 */
export function ScanButton({ label, onScan }: { label: string; onScan: (code: string) => void }) {
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
      if (code) onScan(code.trim());
      else setError('Kein Code erkannt – bitte näher und scharf fotografieren.');
    } catch {
      setError('Das Foto konnte nicht gelesen werden.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => input.current?.click()}
        style={({ pressed }) => [styles.button, { backgroundColor: p.primary, opacity: pressed ? 0.8 : 1 }]}
      >
        {busy ? <ActivityIndicator color={p.onPrimary} /> : <Ionicons name="scan-outline" size={22} color={p.onPrimary} />}
      </Pressable>
      {createElement('input', {
        ref: input,
        type: 'file',
        accept: 'image/*',
        capture: 'environment',
        'aria-label': `${label} (Foto)`,
        style: { display: 'none' },
        onChange: (e: { target: HTMLInputElement }) => onFile(e.target.files?.[0]),
      })}
      {error && <Text style={[styles.error, { color: p.danger }]}>{error}</Text>}
    </View>
  );
}

const FORMATS = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.ITF,
];

async function decodeImage(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  try {
    // Native Erkennung des Browsers, falls vorhanden (z.B. Chrome auf Android)
    const Detector = (globalThis as { BarcodeDetector?: new () => { detect(src: ImageBitmap): Promise<{ rawValue: string }[]> } })
      .BarcodeDetector;
    if (Detector) {
      try {
        const found = await new Detector().detect(bitmap);
        if (found[0]?.rawValue) return found[0].rawValue;
      } catch {
        // weiter mit zxing
      }
    }
    for (const maxSide of [1600, 900, 2400]) {
      const code = decodeWithZxing(bitmap, maxSide);
      if (code) return code;
    }
    return null;
  } finally {
    bitmap.close();
  }
}

function decodeWithZxing(bitmap: ImageBitmap, maxSide: number): string | null {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, width, height);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000;
  }
  const reader = new MultiFormatReader();
  const hints = new Map<DecodeHintType, unknown>([
    [DecodeHintType.TRY_HARDER, true],
    [DecodeHintType.POSSIBLE_FORMATS, FORMATS],
  ]);
  try {
    const result = reader.decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(gray, width, height))), hints);
    return result.getText();
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  button: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  error: { fontSize: 12, marginTop: spacing.xs, maxWidth: 160 },
});
