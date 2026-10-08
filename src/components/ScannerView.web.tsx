import { Ionicons } from '@expo/vector-icons';
import { createElement, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ScanConfirm } from '../domain/scan';
import { useRequiredReads } from '../hooks/useRequiredReads';
import { radius, spacing, usePalette } from '../theme';
import { decodeImage, decodeVideoFrame, type ScanKind } from './barcode.web';

/** onScan kann false liefern, um den Code zu ignorieren und weiter zu scannen. */
export type ScanHandler = (code: string) => boolean | void;

/**
 * Scanner im Browser: Live-Kamera, sobald der Browser sie erlaubt.
 * Wo das nicht geht (keine Kamera, verweigert, eingebettete Seite), wird ein Foto ausgewertet.
 */
export function ScannerView({ hint, onScan, kind = 'barcode' }: { hint: string; onScan: ScanHandler; kind?: ScanKind }) {
  const [mode, setMode] = useState<'live' | 'photo'>(() =>
    typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function' ? 'live' : 'photo',
  );
  return mode === 'live' ? (
    <LiveScanner hint={hint} kind={kind} onScan={onScan} onUnavailable={() => setMode('photo')} />
  ) : (
    <PhotoScanner hint={hint} kind={kind} onScan={onScan} />
  );
}

function LiveScanner({
  hint,
  kind,
  onScan,
  onUnavailable,
}: {
  hint: string;
  kind: ScanKind;
  onScan: ScanHandler;
  onUnavailable: () => void;
}) {
  const p = usePalette();
  const video = useRef<HTMLVideoElement | null>(null);
  const track = useRef<MediaStreamTrack | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState<{ min: number; max: number; on: boolean } | null>(null);
  const required = useRequiredReads(kind);
  const callbacks = useRef({ onScan, onUnavailable, required });
  useEffect(() => {
    callbacks.current = { onScan, onUnavailable, required };
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const canvas = document.createElement('canvas');
    // Ein Code gilt erst, wenn er in mehreren Bildern gleich gelesen wurde (gegen halbe/falsche Nummern)
    const confirm = new ScanConfirm((code) => callbacks.current.required(code));
    const ignored = new Map<string, number>();

    const scanLoop = async () => {
      if (stopped || !video.current) return;
      const codes = await decodeVideoFrame(video.current, canvas, kind).catch(() => []);
      if (stopped) return;
      const now = Date.now();
      for (const code of confirm.push(codes)) {
        if ((ignored.get(code) ?? 0) > now) continue;
        stopped = true;
        if (callbacks.current.onScan(code) !== false) return;
        stopped = false; // ignoriert (z.B. derselbe Code wie eben) → kurz übergehen, weiter scannen
        ignored.set(code, now + 1500);
      }
      timer = setTimeout(scanLoop, 120);
    };

    navigator.mediaDevices
      // Hohe Auflösung: feine Strichcodes brauchen Pixel; die Kamera nimmt, was sie kann
      .getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      .then(async (s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        const t = s.getVideoTracks()[0];
        track.current = t ?? null;
        const caps = (t?.getCapabilities?.() ?? {}) as { focusMode?: string[]; zoom?: { min: number; max: number } };
        if (caps.focusMode?.includes('continuous')) {
          await t.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => {});
        }
        if (caps.zoom && caps.zoom.max >= 1.5) setZoom({ min: caps.zoom.min, max: caps.zoom.max, on: false });
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
      track.current = null;
    };
  }, [kind]);

  /** 2×-Zoom für kleine Codes – Handy weiter weg halten, dann bleibt das Bild scharf */
  const toggleZoom = () => {
    if (!zoom || !track.current) return;
    const on = !zoom.on;
    const value = on ? Math.min(zoom.max, 2) : Math.max(zoom.min, 1);
    void track.current.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] }).catch(() => {});
    setZoom({ ...zoom, on });
  };

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
        {ready ? <View style={kind === 'barcode' ? styles.barFrame : styles.frame} /> : <ActivityIndicator color="#fff" size="large" />}
        <Text style={styles.liveHint}>{ready ? hint : 'Kamera wird gestartet …'}</Text>
      </View>
      {zoom && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={zoom.on ? 'Zoom aus' : 'Zoom 2-fach'}
          onPress={toggleZoom}
          style={[styles.zoom, { backgroundColor: zoom.on ? p.primary : p.card }]}
        >
          <Ionicons name="search-outline" size={16} color={zoom.on ? p.onPrimary : p.text} />
          <Text style={{ color: zoom.on ? p.onPrimary : p.text, fontSize: 12 }}>2×</Text>
        </Pressable>
      )}
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

function PhotoScanner({ hint, kind, onScan }: { hint: string; kind: ScanKind; onScan: ScanHandler }) {
  const p = usePalette();
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const codes = (await decodeImage(file, kind)).map((c) => c.trim()).filter(Boolean);
      if (!codes.length) setError('Kein Code erkannt – bitte näher und scharf fotografieren.');
      // mehrere Codes auf dem Foto: den ersten nehmen, den der Ablauf gerade braucht
      else if (!codes.some((c) => onScan(c) !== false)) setError('Das war derselbe Code wie eben – bitte den anderen Code fotografieren.');
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
  barFrame: { width: '88%', aspectRatio: 2.4, borderWidth: 3, borderColor: '#fff', borderRadius: radius.md },
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
  zoom: {
    position: 'absolute',
    left: spacing.sm,
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
