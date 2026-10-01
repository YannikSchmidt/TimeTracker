import { Ionicons } from '@expo/vector-icons';
import { createElement, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, usePalette } from '../theme';
import { decodeImage, decodeVideoFrame } from './barcode.web';

/** onScan kann false liefern, um den Code zu ignorieren und weiter zu scannen. */
export type ScanHandler = (code: string) => boolean | void;

/**
 * Scanner im Browser: Live-Kamera, sobald der Browser sie erlaubt.
 * Wo das nicht geht (keine Kamera, verweigert, eingebettete Seite), wird ein Foto ausgewertet.
 */
export function ScannerView({ hint, onScan }: { hint: string; onScan: ScanHandler }) {
  const [mode, setMode] = useState<'live' | 'photo'>(() =>
    typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function' ? 'live' : 'photo',
  );
  return mode === 'live' ? (
    <LiveScanner hint={hint} onScan={onScan} onUnavailable={() => setMode('photo')} />
  ) : (
    <PhotoScanner hint={hint} onScan={onScan} />
  );
}

function LiveScanner({
  hint,
  onScan,
  onUnavailable,
}: {
  hint: string;
  onScan: ScanHandler;
  onUnavailable: () => void;
}) {
  const p = usePalette();
  const video = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);
  const callbacks = useRef({ onScan, onUnavailable });
  useEffect(() => {
    callbacks.current = { onScan, onUnavailable };
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const canvas = document.createElement('canvas');

    const scanLoop = async () => {
      if (stopped || !video.current) return;
      const code = await decodeVideoFrame(video.current, canvas).catch(() => null);
      if (stopped) return;
      if (code?.trim()) {
        stopped = true;
        if (callbacks.current.onScan(code.trim()) !== false) return;
        stopped = false; // ignoriert → weiter scannen
      }
      timer = setTimeout(scanLoop, 250);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(async (s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (!video.current) return;
        video.current.srcObject = s;
        await video.current.play().catch(() => {});
        setReady(true);
        void scanLoop();
      })
      .catch(() => {
        if (!stopped) callbacks.current.onUnavailable();
      });

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <View style={styles.liveBox}>
      {createElement('video', {
        ref: video,
        playsInline: true,
        muted: true,
        autoPlay: true,
        'aria-label': `${hint} (Kamera)`,
        style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' },
      })}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
        {ready ? <View style={styles.frame} /> : <ActivityIndicator color="#fff" size="large" />}
        <Text style={styles.liveHint}>{ready ? hint : 'Kamera wird gestartet …'}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Stattdessen Foto aufnehmen"
        onPress={() => callbacks.current.onUnavailable()}
        style={[styles.switch, { backgroundColor: p.card }]}
      >
        <Ionicons name="camera-outline" size={16} color={p.text} />
        <Text style={{ color: p.text, fontSize: 12 }}>Foto</Text>
      </Pressable>
    </View>
  );
}

function PhotoScanner({ hint, onScan }: { hint: string; onScan: ScanHandler }) {
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
      if (code?.trim()) {
        if (onScan(code.trim()) === false) setError('Das war derselbe Code wie eben – bitte den anderen Code fotografieren.');
      } else setError('Kein Code erkannt – bitte näher und scharf fotografieren.');
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
        style={({ pressed }) => [styles.photoBox, { backgroundColor: p.primary, opacity: pressed ? 0.85 : 1 }]}
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
  liveBox: { height: 300, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  frame: { width: '65%', aspectRatio: 1, borderWidth: 3, borderColor: '#fff', borderRadius: radius.lg },
  liveHint: { color: '#fff', fontSize: 15, fontWeight: '600', textShadowColor: '#000', textShadowRadius: 4 },
  switch: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  photoBox: { height: 200, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  title: { fontSize: 20, fontWeight: '700' },
});
